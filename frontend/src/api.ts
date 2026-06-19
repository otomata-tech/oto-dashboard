import { useAuth } from '@/composables/useAuth'

// Le backend du dashboard est oto-mcp (REST /api/*) — pas de serveur propre
// (ADR 0004/0007 : le front ne détient aucun secret, le centre est oto-mcp).
const base = (import.meta.env.VITE_OTO_MCP_BASE as string).replace(/\/$/, '')

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { getAccessToken } = useAuth()
  const token = await getAccessToken()
  const resp = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(`${resp.status} ${(body as { error?: string }).error ?? resp.statusText}`)
  }
  return resp.json() as Promise<T>
}

// Stream authentifié (Server-Sent Events) — retourne la Response brute pour que
// l'appelant lise `response.body` (ReadableStream). EventSource ne peut pas poser
// d'Authorization → on passe par fetch. Lève sur !ok comme api().
export async function apiStream(path: string, signal?: AbortSignal): Promise<Response> {
  const { getAccessToken } = useAuth()
  const token = await getAccessToken()
  const resp = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!resp.ok || !resp.body) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(`${resp.status} ${(body as { error?: string }).error ?? resp.statusText}`)
  }
  return resp
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
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(`${resp.status} ${(body as { error?: string }).error ?? resp.statusText}`)
  }
  return resp.json() as Promise<T>
}
