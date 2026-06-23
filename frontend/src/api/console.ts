// Client REST typé pour la console — toutes les routes oto-mcp (api_routes*.py).
// Pas de fallback : api() lève sur !ok (cf. CLAUDE.md).
import { api, apiUpload, apiPublic } from '@/api'
import type {
  AdminUser, AdminUserDetail, AdminOrgSummary, ApiToken, BillingBalance, ConnectorActivation, ConnectorMeta, MyConnector,
  CreditPack, CreditTransaction, DoctrineBundle,
  GoogleOauthStatus, GroupDetail, GroupInstructionsBundle, GroupListItem, GroupRole, InstructionDetail,
  InstructionVersion, LibraryEntry, LibraryDoctrine, Me, MonitoringSummary,
  DatastoreRow, NamespaceEntry, NamespaceShare, NamespaceGrant, Org, OrgDetail, OrgInvitation, OrgRole, PlatformKey, PresetEntry, Role, ToolCall, ToolEntry,
  ToolRegistryEntry, InstructionUsage, DoctrineRun, UsageGap, ToolFeedbackAgg, RunCall, UsageSignal,
  ScoutQueueItem, ScoutDetail, MementoStatus, MementoWorkspaces, UnipileStatus, WaitlistEntry, AlphaInvite, InvitePreview,
  ReferralLink, InviteResult,
  FieldRule, FieldFiltersBundle, OrgConnectorActivation,
} from '@/types/api'

const j = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })

// ── identité ──
export const getMe = () => api<Me>('/api/me')
export const uploadAvatar = (file: File) =>
  apiUpload<{ ok: boolean; avatar_url: string }>('/api/me/avatar', file)
export const deleteAvatar = () => api('/api/me/avatar', { method: 'DELETE' })
export const uploadOrgLogo = (id: number, file: File) =>
  apiUpload<{ ok: boolean; logo_url: string }>(`/api/orgs/${id}/logo`, file)
export const deleteOrgLogo = (id: number) => api(`/api/orgs/${id}/logo`, { method: 'DELETE' })

// ── connecteurs ──
export const getConnectors = () => api<{ connectors: ConnectorMeta[] }>('/api/connectors')
// Marketplace (ADR 0019) : catalogue exposé + état per-membre (not_selected/active/paused)
// + recommended. Source unique de la library installable ET de « mes connecteurs ».
export const getMyConnectors = () => api<{ connectors: MyConnector[] }>('/api/me/connectors')
export const selectConnector = (name: string) =>
  api(`/api/me/connectors/${encodeURIComponent(name)}/select`, { method: 'POST' })
export const pauseConnector = (name: string) =>
  api(`/api/me/connectors/${encodeURIComponent(name)}/pause`, { method: 'POST' })
export const unselectConnector = (name: string) =>
  api(`/api/me/connectors/${encodeURIComponent(name)}`, { method: 'DELETE' })
// Credential générique (modèle multi-champs, ADR 0011) : poste les champs déclarés
// par le connecteur (`credential_fields`). api_key → {key}, basic_auth (planity) →
// {email,password}, silae → {client_id,client_secret,subscription_key}. Le serveur
// pack/chiffre selon la forme. Une seule surface, zéro branche par connecteur.
export const setCredential = (provider: string, fields: Record<string, string>) =>
  api(`/api/settings/api-keys/${provider}`, { method: 'POST', ...j(fields) })
export const deleteApiKey = (provider: string) =>
  api(`/api/settings/api-keys/${provider}`, { method: 'DELETE' })

// ── sessions ──
export const deleteCrunchbase = () => api('/api/settings/crunchbase', { method: 'DELETE' })

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
export const getMementoWorkspaces = () => api<MementoWorkspaces>('/api/memento/workspaces')

// ── MCP fédéré générique, par connecteur (#40 — atlassian & co.) ──
// Mêmes routes que memento, paramétrées par le nom du connecteur :
// /api/<name>/oauth/{status,start} + DELETE /api/<name>/oauth.
export const getFederatedStatus = (name: string) => api<MementoStatus>(`/api/${name}/oauth/status`)
export const startFederatedOauth = (name: string) => api<{ auth_url: string }>(`/api/${name}/oauth/start`)
export const disconnectFederated = (name: string) => api(`/api/${name}/oauth`, { method: 'DELETE' })

// ── unipile (LinkedIn hébergé) — hosted-auth per-user sous la clé partagée ──
export const getUnipileStatus = () => api<UnipileStatus>('/api/me/unipile')
export const subscribeUnipile = () => api<{ checkout_url: string }>('/api/me/unipile/subscribe', { method: 'POST' })
export const connectUnipile = (channel: string) =>
  api<{ url: string }>('/api/me/unipile/connect', { method: 'POST', ...j({ channel }) })
export const disconnectUnipile = (channel: string) =>
  api(`/api/me/unipile?channel=${encodeURIComponent(channel)}`, { method: 'DELETE' })

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
  api<{ ok: boolean; slug: string; version: number; unresolved_tools?: string[] }>(`/api/me/instructions/${slug}`, { method: 'PUT', ...j({ body_md, title, description }) })
export const getInstructionVersions = (slug: string) =>
  api<{ slug: string; versions: InstructionVersion[] }>(`/api/me/instructions/${slug}/versions`)
export const revertInstruction = (slug: string, version: number) =>
  api(`/api/me/instructions/${slug}/revert`, { method: 'POST', ...j({ version }) })
export const deleteInstruction = (slug: string) =>
  api(`/api/me/instructions/${slug}`, { method: 'DELETE' })
// Registre résolu des tools (ADR 0014) : alimente la résolution des marqueurs
// <tool:slug>, l'autocomplétion @ et le manifeste « outils référencés ».
export const getToolRegistry = () =>
  api<{ tools: ToolRegistryEntry[]; count: number }>('/api/me/tools/registry')
// Usage d'une doctrine, dérivé de tool_calls (chargements par l'agent).
export const getInstructionUsage = (slug: string) =>
  api<InstructionUsage>(`/api/me/instructions/${slug}/usage`)

// ── bibliothèque publique de doctrines (marketplace, capacités library.*) ──
// Catalogue cherchable de doctrines publiées (auteur Otomata ou créateur privé).
// Surface authentifiée ; la vitrine consomme la même donnée en anonyme via
// /api/doctrines/library (public-only).
export const listLibraryDoctrines = (
  params: { q?: string; category?: string; author?: string; limit?: number } = {},
) => {
  const s = new URLSearchParams()
  if (params.q) s.set('query', params.q)   // backend LibraryListInput.field = `query`
  if (params.category) s.set('category', params.category)
  if (params.author) s.set('author_kind', params.author)
  if (params.limit) s.set('limit', String(params.limit))
  const qs = s.toString()
  return api<{ doctrines: LibraryEntry[] }>(`/api/me/doctrines/library${qs ? `?${qs}` : ''}`)
}
export const getLibraryDoctrine = (slug: string) =>
  api<LibraryDoctrine>(`/api/me/doctrines/library/${encodeURIComponent(slug)}`)
// Publie un skill nommé de l'org active dans la bibliothèque (org_admin).
export const publishDoctrine = (payload: {
  slug: string; public_slug?: string; title?: string; description?: string
  category?: string; tags?: string[]; visibility?: 'public' | 'unlisted'
}) =>
  api<{ published: boolean; id: number; slug: string; version: number; visibility: string }>(
    '/api/me/doctrines/publish', { method: 'POST', ...j(payload) })
// Forke une entrée publique dans l'org active comme nouveau skill (org_admin).
export const forkLibraryDoctrine = (slug: string, new_slug?: string) =>
  api<{ forked: boolean; org_id: number; slug: string; version: number; forked_from: number }>(
    '/api/me/doctrines/fork', { method: 'POST', ...j({ slug, new_slug }) })
export const unpublishDoctrine = (id: number) =>
  api(`/api/me/doctrines/library/${id}`, { method: 'DELETE' })

// ── billing (credits d'appel par org, recharge Stripe) ──
export const getBillingBalance = () => api<BillingBalance & { org_id: number }>('/api/me/billing')
export const getBillingTransactions = () =>
  api<{ org_id: number; transactions: CreditTransaction[] }>('/api/me/billing/transactions')
export const getBillingPacks = () => api<{ packs: CreditPack[] }>('/api/billing/packs')
export const startCheckout = (pack_id: string) =>
  api<{ checkout_url: string }>('/api/me/billing/checkout', { method: 'POST', ...j({ pack_id }) })

// ── datastore ──
export const getNamespaces = () => api<{ namespaces: NamespaceEntry[] }>('/api/datastore/namespaces')
export const getNamespaceUrl = (ns: string) => api<{ url: string }>(`/api/datastore/namespaces/${ns}/url`)
export const createNamespace = (namespace: string) =>
  api('/api/datastore/namespaces', { method: 'POST', ...j({ namespace }) })
export const deleteNamespace = (ns: string) =>
  api(`/api/datastore/namespaces/${encodeURIComponent(ns)}`, { method: 'DELETE' })
export interface RowQuery {
  offset?: number; limit?: number; orderBy?: string; orderDir?: 'asc' | 'desc'; q?: string
}
export const getNamespaceRows = (ns: string, opts: RowQuery = {}) => {
  const p = new URLSearchParams()
  if (opts.offset != null) p.set('offset', String(opts.offset))
  if (opts.limit != null) p.set('limit', String(opts.limit))
  if (opts.orderBy) p.set('order_by', opts.orderBy)
  if (opts.orderDir) p.set('order_dir', opts.orderDir)
  if (opts.q) p.set('q', opts.q)
  const qs = p.toString()
  return api<{ rows: DatastoreRow[]; total: number; offset: number; limit: number }>(
    `/api/datastore/namespaces/${encodeURIComponent(ns)}/rows${qs ? `?${qs}` : ''}`)
}
export const renameNamespace = (ns: string, name: string) =>
  api<{ ok: boolean; namespace: string }>(
    `/api/datastore/namespaces/${encodeURIComponent(ns)}`, { method: 'PATCH', ...j({ name }) })
export const transferNamespace = (ns: string, email: string) =>
  api(`/api/datastore/namespaces/${encodeURIComponent(ns)}/transfer`, { method: 'POST', ...j({ email }) })
export const getNamespaceShares = (ns: string) =>
  api<{ shares: NamespaceShare[] }>(`/api/datastore/namespaces/${encodeURIComponent(ns)}/share`)
export const shareNamespace = (ns: string, email: string, permission: string) =>
  api(`/api/datastore/namespaces/${encodeURIComponent(ns)}/share`, { method: 'POST', ...j({ email, permission }) })
export const unshareNamespace = (ns: string, email: string) =>
  api(`/api/datastore/namespaces/${encodeURIComponent(ns)}/share`, { method: 'DELETE', ...j({ email }) })
export const appendNamespaceRow = (ns: string, row: Record<string, unknown>) =>
  api<DatastoreRow>(`/api/datastore/namespaces/${encodeURIComponent(ns)}/rows`,
    { method: 'POST', ...j(row) })
export const updateNamespaceRow = (ns: string, rowId: string, patch: Record<string, unknown>) =>
  api<DatastoreRow>(
    `/api/datastore/namespaces/${encodeURIComponent(ns)}/rows/${encodeURIComponent(rowId)}`,
    { method: 'PATCH', ...j(patch) })
export const deleteNamespaceRow = (ns: string, rowId: string) =>
  api(`/api/datastore/namespaces/${encodeURIComponent(ns)}/rows/${encodeURIComponent(rowId)}`,
    { method: 'DELETE' })

// ── orgs (self-service) ──
export const getMyOrgs = () => api<{ orgs: Org[] }>('/api/me/orgs')
// Bascule l'org active (membre). Contrat unifié MCP/REST : champ `org` = id ou nom.
export const setActiveOrg = (id: number) =>
  api<{ active_org: number; name: string }>('/api/me/active-org', { method: 'PUT', ...j({ org: String(id) }) })
// Désélectionne l'org active → identité perso/globale (ADR 0015).
export const clearActiveOrg = () =>
  api<{ active_org: null }>('/api/me/active-org', { method: 'DELETE' })
// Baseline de toolset de l'org (org_admin) — preset de visibilité des membres.
export const setOrgPreset = (id: number, tools: string[] | null) =>
  api<{ ok: boolean; org_id: number; preset: number | null }>(
    `/api/orgs/${id}/preset`, { method: 'PUT', ...j({ tools }) })
export const createMyOrg = (name: string) =>
  api<{ org_id: number; name: string; active_org: number; org_role: string }>(
    '/api/me/orgs', { method: 'POST', ...j({ name }) })
export const getOrg = (id: number) => api<OrgDetail>(`/api/orgs/${id}`)
export const updateOrg = (id: number, patch: { name?: string; description?: string }) =>
  api<{ ok: true; org_id: number; name: string; description?: string }>(
    `/api/orgs/${id}`, { method: 'PATCH', ...j(patch) })

// ── redaction de champs par connecteur (org_admin, ADR 0015) ──
export const getOrgFieldFilters = (id: number) =>
  api<FieldFiltersBundle>(`/api/orgs/${id}/field-filters`)
// rules=null efface la politique du connecteur (repli sur le défaut serveur).
export const setOrgFieldFilter = (id: number, service: string, rules: FieldRule[] | null, salt?: string) =>
  api<{ ok: boolean; service: string; cleared: boolean; rules: number }>(
    `/api/orgs/${id}/field-filters/${service}`, { method: 'PUT', ...j({ rules, salt }) })
// dry-run : passe un échantillon réel dans le filtre, renvoie la version redactée.
// rules omis = politique effective du service ; sinon teste ce brouillon.
export const previewOrgFieldFilter = (id: number, service: string, payload: unknown, rules?: FieldRule[]) =>
  api<{ org_id: number; service: string; redacted: unknown }>(
    `/api/orgs/${id}/field-filters/${service}/preview`, { method: 'POST', ...j({ payload, rules }) })

// ── gouvernance connecteurs au niveau org (cockpit /org/connectors, ADR 0022) ──
// Activation : master plateforme + override d'org + effectif + recommandé, par connecteur.
export const getOrgConnectorActivation = (id: number) =>
  api<{ org_id: number; connectors: OrgConnectorActivation[] }>(`/api/orgs/${id}/connectors/activation`)
// Plafond dur : force ON/OFF un connecteur pour toute l'org (enabled=true borné au master).
export const setOrgConnectorActivation = (id: number, name: string, enabled: boolean) =>
  api<{ org_id: number; connector: string; enabled: boolean }>(
    `/api/orgs/${id}/connectors/${encodeURIComponent(name)}/activation`, { method: 'PUT', ...j({ enabled }) })
// Supprime l'override d'org → repli sur le master plateforme.
export const clearOrgConnectorActivation = (id: number, name: string) =>
  api<{ org_id: number; connector: string; cleared: boolean }>(
    `/api/orgs/${id}/connectors/${encodeURIComponent(name)}/activation`, { method: 'DELETE' })
// Recommandation d'org (« org propose ») — baseline consultative de connecteurs.
export const setOrgConnectors = (id: number, connectors: string[]) =>
  api<{ org_id: number; recommended: string[] }>(
    `/api/orgs/${id}/default-connectors`, { method: 'PUT', ...j({ connectors }) })

// ── invitations d'équipe (onboarding SaaS) ──
export const listInvitations = (id: number) =>
  api<{ invitations: OrgInvitation[] }>(`/api/orgs/${id}/invitations`)
// send_email=false → pas d'envoi, le retour porte le code/lien à partager soi-même.
export const inviteMember = (id: number, email: string | null, role: OrgRole, sendEmail = true) =>
  api<InviteResult & { role: string }>(
    `/api/orgs/${id}/invitations`, { method: 'POST', ...j({ email, role, send_email: sendEmail }) })
export const revokeInvitation = (id: number, inviteId: number) =>
  api(`/api/orgs/${id}/invitations/${inviteId}`, { method: 'DELETE' })
// Aperçus publics (sans auth — le code/token EST le secret). Alimentent la page
// d'accueil « vous êtes invité·e » avant la création de compte.
export const previewInvite = (token: string) =>
  apiPublic<InvitePreview>(`/api/invitations/${encodeURIComponent(token)}`)
export const previewInviteByCode = (code: string) =>
  apiPublic<InvitePreview>(`/api/invitations/code/${encodeURIComponent(code)}`)
export const previewReferral = (carrier: string) =>
  apiPublic<InvitePreview>(`/api/invitations/referral/${encodeURIComponent(carrier)}`)
// Accept par token mail (legacy), code court nominatif, ou code porteur (referral).
export const acceptInvite = (payload: { token?: string; code?: string; carrier?: string }) =>
  api<{ ok: boolean; referral: boolean; org_id: number | null; org_role: string | null; name: string | null; self?: boolean }>(
    '/api/me/invitations/accept', { method: 'POST', ...j(payload) })

// ── accès plateforme & invitation virale (alpha, ADR 0013) ──
// Lien referral réutilisable du compte (à diffuser au réseau).
export const getReferralLink = () =>
  api<ReferralLink>('/api/me/referral-link')
// Un alpha-user actif invite quelqu'un (budget débité à l'acceptation). send_email
// =false → renvoie le code à partager soi-même. L'invité crée sa propre org.
export const sendAlphaInvite = (email: string | null, sendEmail = true) =>
  api<InviteResult>('/api/me/alpha-invites', { method: 'POST', ...j({ email, send_email: sendEmail }) })
// Admin : invite un tiers au service, SANS entamer de quota referral.
export const adminAlphaInvite = (email: string | null, sendEmail = true) =>
  api<InviteResult>('/api/admin/alpha-invites', { method: 'POST', ...j({ email, send_email: sendEmail }) })
export const listAlphaInvites = () =>
  api<{ invitations: AlphaInvite[] }>('/api/admin/alpha-invites')
export const revokeAlphaInvite = (id: number) =>
  api(`/api/admin/alpha-invites/${id}`, { method: 'DELETE' })
export const resendAlphaInvite = (email: string) =>
  api<InviteResult>('/api/admin/alpha-invites/resend', { method: 'POST', ...j({ email }) })
// Admin : file d'attente + approbation (active + quota) + ajustement de quota.
export const getWaitlist = () =>
  api<{ waitlist: WaitlistEntry[]; count: number }>('/api/admin/waitlist')
export const grantAlphaAccess = (sub: string, quota?: number) =>
  api<{ ok: boolean; sub: string; access_status: string; invite_quota: number; emailed: boolean }>(
    `/api/admin/users/${sub}/access`, { method: 'POST', ...j(quota == null ? {} : { quota }) })
export const rejectAlphaAccess = (sub: string) =>
  api<{ ok: boolean; sub: string; access_status: string }>(
    `/api/admin/users/${sub}/block`, { method: 'POST' })
export const setUserQuota = (sub: string, quota: number) =>
  api<{ ok: boolean; sub: string; invite_quota: number }>(
    `/api/admin/users/${sub}/quota`, { method: 'PUT', ...j({ quota }) })
export const setOrgMemberRole = (id: number, sub: string, role: string) =>
  api(`/api/orgs/${id}/members/${sub}`, { method: 'POST', ...j({ role }) })
export const removeOrgMember = (id: number, sub: string) =>
  api(`/api/orgs/${id}/members/${sub}`, { method: 'DELETE' })
// Pose/rotation de la clé partagée d'org (org_admin, self-service, ADR 0022).
export const setOrgSecret = (id: number, provider: string, api_key: string, base_url?: string) =>
  api<{ ok: boolean; org_id: number; provider: string }>(
    `/api/orgs/${id}/secrets/${provider}`, { method: 'PUT', ...j({ api_key, base_url }) })
export const deleteOrgSecret = (id: number, provider: string) =>
  api(`/api/orgs/${id}/secrets/${provider}`, { method: 'DELETE' })

// ── groupes (départements / équipes, ADR 0012) ──
export const listGroups = (orgId: number) =>
  api<{ org_id: number; groups: GroupListItem[] }>(`/api/orgs/${orgId}/groups`)
export const createGroup = (orgId: number, name: string, description = '') =>
  api<{ id: number; group_id: number; name: string }>(
    `/api/orgs/${orgId}/groups`, { method: 'POST', ...j({ name, description }) })
export const getGroup = (id: number) => api<GroupDetail>(`/api/groups/${id}`)
export const updateGroup = (id: number, patch: { name?: string; description?: string }) =>
  api(`/api/groups/${id}`, { method: 'PATCH', ...j(patch) })
export const deleteGroup = (id: number) => api(`/api/groups/${id}`, { method: 'DELETE' })
export const useGroup = (group_id: number) =>
  api<{ active_group: number; name: string; active_org: number }>(
    '/api/me/active-group', { method: 'PUT', ...j({ group_id }) })
export const clearActiveGroup = () => api('/api/me/active-group', { method: 'DELETE' })
export const addGroupMember = (id: number, target: string, role: GroupRole) =>
  api(`/api/groups/${id}/members`, { method: 'POST', ...j({ target, role }) })
export const setGroupMemberRole = (id: number, sub: string, role: GroupRole) =>
  api(`/api/groups/${id}/members/${sub}`, { method: 'POST', ...j({ role }) })
export const removeGroupMember = (id: number, sub: string) =>
  api(`/api/groups/${id}/members/${sub}`, { method: 'DELETE' })
export const setGroupSecret = (id: number, provider: string, api_key: string, base_url?: string) =>
  api(`/api/groups/${id}/secrets/${provider}`, { method: 'PUT', ...j({ api_key, base_url }) })
export const deleteGroupSecret = (id: number, provider: string) =>
  api(`/api/groups/${id}/secrets/${provider}`, { method: 'DELETE' })
export const setGroupPreset = (id: number, tools: string[] | null) =>
  api(`/api/groups/${id}/preset`, { method: 'PUT', ...j({ tools }) })
// doctrine & skills du groupe (lecture = membre, écriture = chef)
export const getGroupInstructions = (id: number) =>
  api<GroupInstructionsBundle>(`/api/groups/${id}/instructions`)
export const getGroupInstruction = (id: number, slug: string) =>
  api<InstructionDetail>(`/api/groups/${id}/instructions/${slug}`)
export const putGroupInstruction = (id: number, slug: string, body_md: string, title?: string, description?: string) =>
  api<{ slug: string; version: number }>(`/api/groups/${id}/instructions/${slug}`, { method: 'PUT', ...j({ body_md, title, description }) })
export const deleteGroupInstruction = (id: number, slug: string) =>
  api(`/api/groups/${id}/instructions/${slug}`, { method: 'DELETE' })
export const getGroupInstructionVersions = (id: number, slug: string) =>
  api<{ slug: string; versions: InstructionVersion[] }>(`/api/groups/${id}/instructions/${slug}/versions`)
export const revertGroupInstruction = (id: number, slug: string, version: number) =>
  api(`/api/groups/${id}/instructions/${slug}/revert`, { method: 'POST', ...j({ version }) })

// ── admin ──
export const getAdminUsers = () => api<{ users: AdminUser[] }>('/api/admin/users')
export const getAdminUser = (sub: string) =>
  api<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(sub)}`)
export const setUserRole = (sub: string, role: Role) =>
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

// platform key grants au niveau ORG (couche 2, partage à tous les membres) — super_admin
export const grantOrgPlatformKey = (orgId: number, keyId: number, daily_quota?: number) =>
  api(`/api/admin/orgs/${orgId}/grants/${keyId}`, { method: 'POST', ...j({ daily_quota }) })
export const revokeOrgPlatformKey = (orgId: number, keyId: number) =>
  api(`/api/admin/orgs/${orgId}/grants/${keyId}`, { method: 'DELETE' })

// namespace grants per-user (controlled namespaces)
export const getNamespaceGrants = () => api<{ grants: NamespaceGrant[] }>('/api/admin/namespace-grants')
export const grantNamespace = (sub: string, namespace: string) =>
  api(`/api/admin/users/${sub}/namespace-grants/${namespace}`, { method: 'POST' })
export const revokeNamespaceGrant = (sub: string, namespace: string) =>
  api(`/api/admin/users/${sub}/namespace-grants/${namespace}`, { method: 'DELETE' })

// option comps (offrir/retirer GRATUITEMENT une option payante — couche abonnement,
// oto-backend/docs/connector-model.md). entity_type user|org, super_admin only.
export const setOptionComp = (entity_type: 'user' | 'org', entity_id: string, option: string, on: boolean) =>
  api('/api/admin/option-comps', { method: 'POST', ...j({ entity_type, entity_id, option, on }) })

// ── admin orgs (cross-org governance) ──
export const getAdminOrgs = () => api<{ orgs: AdminOrgSummary[] }>('/api/admin/orgs')
export const createOrg = (name: string) =>
  api<{ id: number }>('/api/admin/orgs', { method: 'POST', ...j({ name }) })
export const getAdminOrg = (id: number) => api<OrgDetail>(`/api/admin/orgs/${id}`)
export const archiveAdminOrg = (id: number) =>
  api(`/api/admin/orgs/${id}`, { method: 'DELETE' })
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

// ── admin connectors (cran d'activation, ADR 0010) ──
export const getAdminConnectors = () =>
  api<{ connectors: ConnectorActivation[] }>('/api/admin/connectors/activation')
export const setConnectorActivation = (connector: string, enabled: boolean, org_id?: number) =>
  api('/api/admin/connectors/activation', { method: 'POST', ...j({ connector, enabled, org_id }) })
export const clearConnectorOverride = (connector: string, org_id: number) =>
  api(`/api/admin/connectors/activation?connector=${encodeURIComponent(connector)}&org_id=${org_id}`, { method: 'DELETE' })

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

// ── usage / déroulés (ADR 0017, admin) ──
export const getUsageRuns = () => api<{ runs: DoctrineRun[] }>('/api/admin/usage/runs')
export const getUsageRun = (runId: string) =>
  api<{ run_id: string; calls: RunCall[] }>(`/api/admin/usage/runs/${runId}`)
export const getUsageGaps = () => api<{ gaps: UsageGap[] }>('/api/admin/usage/gaps')
export const getUsageToolQuality = () => api<{ tools: ToolFeedbackAgg[] }>('/api/admin/usage/tool-quality')
// Détail (drill-down) : signaux bruts filtrés par signal (tool_feedback|gap) + target (outil/intent).
export const getUsageSignals = (signal?: string, target?: string) => {
  const q = new URLSearchParams()
  if (signal) q.set('signal', signal)
  if (target) q.set('target', target)
  const qs = q.toString()
  return api<{ signals: UsageSignal[] }>(`/api/admin/usage/signals${qs ? `?${qs}` : ''}`)
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
