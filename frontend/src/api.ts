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
