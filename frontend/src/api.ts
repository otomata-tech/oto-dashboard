import { useAuth, type TokenTarget } from '@/composables/useAuth'
import { getViewUser, requestViewAsWrite, viewHeaders } from '@/lib/viewOrg'
import { CODE_HORS_VUE, lectureHorsVue } from '@/lib/vueBornee'
import { beginBusy, endBusy } from '@/lib/busy'
import { saveBlob } from '@/lib/download'

// Un refus REST tel que le backend le rend : `error` (jeton machine), `detail`
// (la phrase écrite pour être lue telle quelle) et `details` — la forme STRUCTURÉE
// du refus quand il y en a une (ADR 0009 `AuthzDenied.details`).
//
// ⚠️ `message` reste exactement `"<status> <code>"` : c'est ce que `humanize()` parse
// et ce que tout l'écran attendait déjà. La sous-classe n'ajoute que ce que
// l'enveloppe portait ET qu'on jetait — le tunnel de souscription (#127/#128) en a
// besoin, un 409 y nommant les préalables manquants dans `details.blockers`.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(`${status} ${code}`)
    this.name = 'ApiError'
  }
}

// Construit l'ApiError d'une réponse non-ok. Le corps peut ne pas être du JSON
// (502 d'un proxy, page d'erreur) : on retombe alors sur le statusText, comme avant.
async function apiError(resp: Response): Promise<ApiError> {
  const body = (await resp.json().catch(() => ({}))) as {
    error?: string; detail?: string; details?: Record<string, unknown>
  }
  const err = new ApiError(resp.status, body.error ?? resp.statusText, body.detail, body.details)
  // Une écriture en « voir en tant que » refusée faute d'acceptation : le bandeau
  // propose alors le geste d'acceptation (au super_admin), au lieu d'un refus sec.
  if (err.status === 403 && err.code === 'view_as_read_only' && getViewUser()) requestViewAsWrite()
  return err
}

// Le backend du dashboard est oto-mcp (REST /api/*) — pas de serveur propre
// (ADR 0004/0007 : le front ne détient aucun secret, le centre est oto-mcp).
const base = (import.meta.env.VITE_OTO_MCP_BASE as string).replace(/\/$/, '')

// La facturation vit dans OTO-COMMERCE (`https://commerce.oto.cx`, routes sous `/api`),
// avec sa propre ressource Logto (`useAuth`). Lue à l'APPEL et non au chargement : un poste
// dev sans commerce garde une console qui marche, seul l'écran de facturation lève.
const commerceBase = String(import.meta.env.VITE_OTO_COMMERCE_BASE ?? '').replace(/\/$/, '')

function commerceUrl(path: string): string {
  if (!commerceBase) throw new Error('commerce_unconfigured')
  return `${commerceBase}${path}`
}

// Le jeton du service visé. Toute erreur ICI = session Logto morte (refresh 400, token
// undefined, erreur OIDC localisée type « La requête de consentement est invalide ») —
// normalisée pour que l'UI propose « se reconnecter » au lieu d'un faux incident serveur.
// Seule exception : un commerce absent de la config n'est pas une session morte.
async function bearer(target: TokenTarget = 'core'): Promise<string> {
  const { getAccessToken } = useAuth()
  try {
    return await getAccessToken(target)
  } catch (e) {
    if (e instanceof Error && e.message === 'commerce_unconfigured') throw e
    throw new Error('stale_session')
  }
}

// L'envoi JSON authentifié, commun au cœur et au commerce : seuls l'URL, le jeton et les
// en-têtes propres au service changent.
async function sendJson<T>(url: string, token: string, init: RequestInit,
  extra: Record<string, string>): Promise<T> {
  beginBusy()   // active la présence « réfléchit » d'Oto (favicon) le temps de l'appel
  try {
    const resp = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
        ...init.headers,
      },
    })
    if (!resp.ok) throw await apiError(resp)
    return resp.json() as Promise<T>
  } finally {
    endBusy()
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Vue bornée d'un org_admin (oto#270) : une lecture que le serveur refuse dans cette vue
  // ne part pas — même refus, sans l'aller-retour (`lib/vueBornee`, sur la liste que
  // `/api/me` sert).
  if (lectureHorsVue(path, init.method)) throw new ApiError(403, CODE_HORS_VUE)
  const token = await bearer()
  // view-as : scope la consultation (ADR 0023) ; écriture seulement après acceptation.
  return sendJson<T>(`${base}${path}`, token, init, viewHeaders())
}

// Un appel à OTO-COMMERCE : son jeton, et SANS les en-têtes de « voir en tant que » — le
// commerce ne les connaît pas, il relit lui-même auprès du cœur le rôle du porteur du jeton
// dans l'org du chemin. Même enveloppe de refus `{error, detail}`, donc même `ApiError`.
export async function apiCommerce<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = commerceUrl(path)
  return sendJson<T>(url, await bearer('commerce'), init, {})
}

// Fetch PUBLIC (sans bearer) — pour les endpoints non authentifiés (ex. aperçu
// d'invitation, où le token de l'URL est le seul secret). Même gestion d'erreur.
export async function apiPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${base}${path}`, init)
  if (!resp.ok) throw await apiError(resp)
  return resp.json() as Promise<T>
}

// Téléchargement authentifié d'un binaire (ex. export zip #6 B2) : fetch avec bearer
// + view-as, récupère le blob et déclenche le download navigateur. Le nom vient du
// Content-Disposition, sinon `fallbackName`.
export async function apiDownload(path: string, fallbackName = 'export.zip'): Promise<void> {
  return download(`${base}${path}`, await bearer(), viewHeaders(), fallbackName)
}

// Le même téléchargement, depuis OTO-COMMERCE (le PDF d'une facture) : son jeton, sans
// en-têtes de « voir en tant que ».
export async function apiCommerceDownload(path: string, fallbackName: string): Promise<void> {
  const url = commerceUrl(path)
  return download(url, await bearer('commerce'), {}, fallbackName)
}

async function download(url: string, token: string, extra: Record<string, string>,
  fallbackName: string): Promise<void> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ...extra } })
  if (!resp.ok) throw await apiError(resp)
  const blob = await resp.blob()
  const cd = resp.headers.get('Content-Disposition') || ''
  const m = cd.match(/filename="?([^"]+)"?/)
  saveBlob(m?.[1] ?? fallbackName, blob)
}

// Upload multipart (avatar / logo) : FormData champ `file`, PAS de Content-Type
// (le navigateur pose le boundary lui-même). Même gestion d'erreur que api().
export async function apiUpload<T>(path: string, file: File, method = 'POST'): Promise<T> {
  const { getAccessToken } = useAuth()
  const token = await getAccessToken()
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...viewHeaders() },
    body: form,
  })
  if (!resp.ok) throw await apiError(resp)
  return resp.json() as Promise<T>
}
