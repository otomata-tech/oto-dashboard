import { useAuth } from '@/composables/useAuth'
import { viewHeaders } from '@/lib/viewOrg'
import { beginBusy, endBusy } from '@/lib/busy'

// Le backend du dashboard est oto-mcp (REST /api/*) — pas de serveur propre
// (ADR 0004/0007 : le front ne détient aucun secret, le centre est oto-mcp).
const base = (import.meta.env.VITE_OTO_MCP_BASE as string).replace(/\/$/, '')

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { getAccessToken } = useAuth()
  // Toute erreur ICI = session Logto morte (refresh 400, token undefined, erreur
  // OIDC localisée type « La requête de consentement est invalide ») — normalisée
  // pour que l'UI propose « se reconnecter » au lieu d'un faux incident serveur.
  let token: string
  try {
    token = await getAccessToken()
  } catch {
    throw new Error('stale_session')
  }
  beginBusy()   // active la présence « réfléchit » d'Oto (favicon) le temps de l'appel
  try {
    const resp = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...viewHeaders(),   // view-as : scope la consultation org/équipe (ADR 0023), sans muter l'identité
        ...init.headers,
      },
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}))
      throw new Error(`${resp.status} ${(body as { error?: string }).error ?? resp.statusText}`)
    }
    return resp.json() as Promise<T>
  } finally {
    endBusy()
  }
}

// Fetch PUBLIC (sans bearer) — pour les endpoints non authentifiés (ex. aperçu
// d'invitation, où le token de l'URL est le seul secret). Même gestion d'erreur.
export async function apiPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${base}${path}`, init)
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(`${resp.status} ${(body as { error?: string }).error ?? resp.statusText}`)
  }
  return resp.json() as Promise<T>
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
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(`${resp.status} ${(body as { error?: string }).error ?? resp.statusText}`)
  }
  return resp.json() as Promise<T>
}
