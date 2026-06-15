// Client REST typé pour la console — toutes les routes oto-mcp (api_routes*.py).
// Pas de fallback : api() lève sur !ok (cf. CLAUDE.md).
import { api } from '@/api'
import type {
  AdminUser, AdminUserDetail, AdminOrgSummary, ApiToken, ConnectorMeta, DoctrineBundle,
  GoogleOauthStatus, InstructionDetail, InstructionVersion, Me, MonitoringSummary,
  NamespaceGrant, Org, OrgDetail, OrgInvitation, OrgRole, PlatformKey, PresetEntry, ToolCall, ToolEntry,
  WhatsappStatus, ScoutQueueItem, ScoutDetail, MementoStatus,
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

// ── memento (MCP fédéré, otomata#16) ──
export const getMementoStatus = () => api<MementoStatus>('/api/memento/oauth/status')
export const startMementoOauth = () => api<{ auth_url: string }>('/api/memento/oauth/start')
export const disconnectMemento = () => api('/api/memento/oauth', { method: 'DELETE' })

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
export const deleteInstruction = (slug: string) =>
  api(`/api/me/instructions/${slug}`, { method: 'DELETE' })

// ── datastore ──
export const getNamespaces = () => api<{ namespaces: string[] }>('/api/datastore/namespaces')
export const getNamespaceUrl = (ns: string) => api<{ url: string }>(`/api/datastore/namespaces/${ns}/url`)
export const createNamespace = (namespace: string) =>
  api('/api/datastore/namespaces', { method: 'POST', ...j({ namespace }) })

// ── orgs (self-service) ──
export const getMyOrgs = () => api<{ orgs: Org[] }>('/api/me/orgs')
export const createMyOrg = (name: string) =>
  api<{ org_id: number; name: string; active_org: number; org_role: string }>(
    '/api/me/orgs', { method: 'POST', ...j({ name }) })
export const getOrg = (id: number) => api<OrgDetail>(`/api/orgs/${id}`)

// ── invitations d'équipe (onboarding SaaS) ──
export const listInvitations = (id: number) =>
  api<{ invitations: OrgInvitation[] }>(`/api/orgs/${id}/invitations`)
export const inviteMember = (id: number, email: string, role: OrgRole) =>
  api<{ ok: boolean; email: string; role: string; emailed: boolean; invite_url: string }>(
    `/api/orgs/${id}/invitations`, { method: 'POST', ...j({ email, role }) })
export const revokeInvitation = (id: number, inviteId: number) =>
  api(`/api/orgs/${id}/invitations/${inviteId}`, { method: 'DELETE' })
export const acceptInvite = (token: string) =>
  api<{ ok: boolean; org_id: number; org_role: string; name: string | null }>(
    '/api/me/invitations/accept', { method: 'POST', ...j({ token }) })
export const setOrgMemberRole = (id: number, sub: string, role: string) =>
  api(`/api/orgs/${id}/members/${sub}`, { method: 'POST', ...j({ role }) })
export const deleteOrgSecret = (id: number, provider: string) =>
  api(`/api/orgs/${id}/secrets/${provider}`, { method: 'DELETE' })

// ── admin ──
export const getAdminUsers = () => api<{ users: AdminUser[] }>('/api/admin/users')
export const getAdminUser = (sub: string) =>
  api<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(sub)}`)
export const setUserRole = (sub: string, role: string) =>
  api(`/api/admin/users/${sub}/role`, { method: 'POST', ...j({ role }) })
export const getPlatformKeys = () => api<{ platform_keys: PlatformKey[] }>('/api/admin/platform-keys')
export const createPlatformKey = (provider: string, label: string, api_key: string) =>
  api<{ id: number; provider: string; label: string }>('/api/admin/platform-keys', { method: 'POST', ...j({ provider, label, api_key }) })
export const deletePlatformKey = (id: number) => api(`/api/admin/platform-keys/${id}`, { method: 'DELETE' })

// platform key grants per-user (lent platform keys with a daily quota)
export const grantPlatformKey = (sub: string, keyId: number, daily_quota?: number) =>
  api(`/api/admin/users/${sub}/grants/${keyId}`, { method: 'POST', ...j({ daily_quota }) })
export const revokePlatformKey = (sub: string, keyId: number) =>
  api(`/api/admin/users/${sub}/grants/${keyId}`, { method: 'DELETE' })

// namespace grants per-user (controlled namespaces)
export const getNamespaceGrants = () => api<{ grants: NamespaceGrant[] }>('/api/admin/namespace-grants')
export const grantNamespace = (sub: string, namespace: string) =>
  api(`/api/admin/users/${sub}/namespace-grants/${namespace}`, { method: 'POST' })
export const revokeNamespaceGrant = (sub: string, namespace: string) =>
  api(`/api/admin/users/${sub}/namespace-grants/${namespace}`, { method: 'DELETE' })

// ── admin orgs (cross-org governance) ──
export const getAdminOrgs = () => api<{ orgs: AdminOrgSummary[] }>('/api/admin/orgs')
export const createOrg = (name: string) =>
  api<{ id: number }>('/api/admin/orgs', { method: 'POST', ...j({ name }) })
export const getAdminOrg = (id: number) => api<OrgDetail>(`/api/admin/orgs/${id}`)
export const addAdminOrgMember = (id: number, target: string, role: OrgRole) =>
  api(`/api/admin/orgs/${id}/members`, { method: 'POST', ...j({ target, role }) })
export const setAdminOrgMemberRole = (id: number, sub: string, role: OrgRole) =>
  api(`/api/admin/orgs/${id}/members/${sub}`, { method: 'POST', ...j({ role }) })
export const removeAdminOrgMember = (id: number, sub: string) =>
  api(`/api/admin/orgs/${id}/members/${sub}`, { method: 'DELETE' })
export const putAdminOrgSecret = (id: number, provider: string, api_key: string, base_url?: string) =>
  api(`/api/admin/orgs/${id}/secrets/${provider}`, { method: 'PUT', ...j({ api_key, base_url }) })
export const deleteAdminOrgSecret = (id: number, provider: string) =>
  api(`/api/admin/orgs/${id}/secrets/${provider}`, { method: 'DELETE' })
export const grantOrgEntitlement = (id: number, namespace: string) =>
  api(`/api/admin/orgs/${id}/entitlements/${namespace}`, { method: 'POST' })
export const revokeOrgEntitlement = (id: number, namespace: string) =>
  api(`/api/admin/orgs/${id}/entitlements/${namespace}`, { method: 'DELETE' })

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

// Activité de l'utilisateur courant (ses propres appels) — per-user, pas admin.
export const getMyCalls = (params: { limit?: number; tool?: string; errors?: boolean; days?: number } = {}) => {
  const q = new URLSearchParams()
  if (params.limit) q.set('limit', String(params.limit))
  if (params.tool) q.set('tool', params.tool)
  if (params.errors) q.set('errors', '1')
  if (params.days) q.set('days', String(params.days))
  const qs = q.toString()
  return api<{ calls: ToolCall[] }>(`/api/me/calls${qs ? `?${qs}` : ''}`)
}

// ── scout (harnais prospection, ADR 0008) ──
export const getScoutQueue = (limit = 50) =>
  api<{ items: ScoutQueueItem[]; count: number }>(`/api/scout/queue?limit=${limit}`)
export const claimNextProspect = () =>
  api<{ prospect: ScoutQueueItem | null }>('/api/scout/claim-next', { method: 'POST' })
export const getProspect = (id: number) => api<ScoutDetail>(`/api/scout/prospects/${id}`)
export const recordAction = (id: number, canal: string, outcome: string, note?: string) =>
  api<ScoutDetail>(`/api/scout/prospects/${id}/actions`, { method: 'POST', ...j({ canal, outcome, note }) })
