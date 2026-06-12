// Client REST typé pour la console — toutes les routes oto-mcp (api_routes*.py).
// Pas de fallback : api() lève sur !ok (cf. CLAUDE.md).
import { api } from '@/api'
import type {
  AdminUser, AdminOrgSummary, ApiToken, ConnectorMeta, DoctrineBundle,
  GoogleOauthStatus, InstructionDetail, InstructionVersion, Me, MonitoringSummary,
  NamespaceGrant, Org, OrgDetail, PlatformKey, PresetEntry, ToolCall, ToolEntry,
  WhatsappStatus,
} from '@/types/api'

const j = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })

// ── identité ──
export const getMe = () => api<Me>('/api/me')

// ── connecteurs ──
export const getConnectors = () => api<{ connectors: ConnectorMeta[] }>('/api/connectors')
export const setApiKey = (provider: string, key: string) =>
  api(`/api/settings/api-keys/${provider}`, { method: 'POST', ...j({ key }) })
export const deleteApiKey = (provider: string) =>
  api(`/api/settings/api-keys/${provider}`, { method: 'DELETE' })

// ── sessions ──
export const deleteLinkedin = () => api('/api/settings/linkedin', { method: 'DELETE' })
export const deleteCrunchbase = () => api('/api/settings/crunchbase', { method: 'DELETE' })
export const getWhatsappStatus = () => api<WhatsappStatus>('/api/whatsapp/status')

// ── google ──
export const getGoogleStatus = () => api<GoogleOauthStatus>('/api/google/oauth/status')
export const startGoogleOauth = () => api<{ auth_url: string }>('/api/google/oauth/start')
export const setGoogleDefault = (account: string) =>
  api('/api/google/oauth/default', { method: 'POST', ...j({ account }) })
export const revokeGoogle = (account?: string) =>
  api(`/api/google/oauth${account ? `?account=${encodeURIComponent(account)}` : ''}`, { method: 'DELETE' })

// ── cli tokens ──
export const getTokens = () => api<{ tokens: ApiToken[] }>('/api/me/tokens')
export const createToken = (label?: string) =>
  api<{ token: string; label: string }>('/api/me/tokens', { method: 'POST', ...j({ label }) })
export const deleteToken = (id: number) => api(`/api/me/tokens/${id}`, { method: 'DELETE' })

// ── tools / presets ──
export const getTools = () => api<{ tools: ToolEntry[] }>('/api/me/tools')
export const disableTool = (name: string) => api(`/api/me/tools/${name}`, { method: 'POST' })
export const enableTool = (name: string) => api(`/api/me/tools/${name}`, { method: 'DELETE' })
export const getPresets = () => api<{ presets: PresetEntry[] }>('/api/me/presets')
export const applyPreset = (name: string) => api(`/api/me/presets/${name}/apply`, { method: 'POST' })
export const savePreset = (name: string) => api(`/api/me/presets/${name}`, { method: 'POST' })
export const deletePreset = (name: string) => api(`/api/me/presets/${name}`, { method: 'DELETE' })

// ── doctrine / instructions ──
export const getDoctrine = () => api<DoctrineBundle>('/api/me/instructions')
export const getInstruction = (slug: string, version?: number) =>
  api<InstructionDetail>(`/api/me/instructions/${slug}${version ? `?version=${version}` : ''}`)
export const putInstruction = (slug: string, body_md: string, title?: string, description?: string) =>
  api<{ ok: boolean; slug: string; version: number }>(`/api/me/instructions/${slug}`, { method: 'PUT', ...j({ body_md, title, description }) })
export const getInstructionVersions = (slug: string) =>
  api<{ slug: string; versions: InstructionVersion[] }>(`/api/me/instructions/${slug}/versions`)
export const revertInstruction = (slug: string, version: number) =>
  api(`/api/me/instructions/${slug}/revert`, { method: 'POST', ...j({ version }) })

// ── datastore ──
export const getNamespaces = () => api<{ namespaces: string[] }>('/api/datastore/namespaces')
export const getNamespaceUrl = (ns: string) => api<{ url: string }>(`/api/datastore/namespaces/${ns}/url`)
export const createNamespace = (namespace: string) =>
  api('/api/datastore/namespaces', { method: 'POST', ...j({ namespace }) })

// ── orgs (self-service) ──
export const getMyOrgs = () => api<{ orgs: Org[] }>('/api/me/orgs')
export const getOrg = (id: number) => api<OrgDetail>(`/api/orgs/${id}`)
export const setOrgMemberRole = (id: number, sub: string, role: string) =>
  api(`/api/orgs/${id}/members/${sub}`, { method: 'POST', ...j({ role }) })
export const deleteOrgSecret = (id: number, provider: string) =>
  api(`/api/orgs/${id}/secrets/${provider}`, { method: 'DELETE' })

// ── admin ──
export const getAdminUsers = () => api<{ users: AdminUser[] }>('/api/admin/users')
export const setUserRole = (sub: string, role: string) =>
  api(`/api/admin/users/${sub}/role`, { method: 'POST', ...j({ role }) })
export const getAdminOrgs = () => api<{ orgs: AdminOrgSummary[] }>('/api/admin/orgs')
export const getPlatformKeys = () => api<{ platform_keys: PlatformKey[] }>('/api/admin/platform-keys')
export const deletePlatformKey = (id: number) => api(`/api/admin/platform-keys/${id}`, { method: 'DELETE' })
export const getNamespaceGrants = () => api<{ grants: NamespaceGrant[] }>('/api/admin/namespace-grants')
export const revokeNamespaceGrant = (sub: string, namespace: string) =>
  api(`/api/admin/users/${sub}/namespace-grants/${namespace}`, { method: 'DELETE' })

// ── monitoring (admin) ──
export const getMonitoringSummary = (days: number) =>
  api<MonitoringSummary>(`/api/admin/monitoring/summary?days=${days}`)
export const getMonitoringCalls = (params: { limit?: number; sub?: string; tool?: string; errors?: boolean; days?: number } = {}) => {
  const q = new URLSearchParams()
  if (params.limit) q.set('limit', String(params.limit))
  if (params.sub) q.set('sub', params.sub)
  if (params.tool) q.set('tool', params.tool)
  if (params.errors) q.set('errors', '1')
  if (params.days) q.set('days', String(params.days))
  const qs = q.toString()
  return api<{ calls: ToolCall[] }>(`/api/admin/monitoring/calls${qs ? `?${qs}` : ''}`)
}
