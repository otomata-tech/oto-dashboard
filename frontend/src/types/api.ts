// Contrats REST oto-backend (mcp.oto.ninja) consommés par le dashboard.
// Reflètent les handlers de oto-mcp (api_routes*.py) + l'ancien account/src/types.

export type Role = 'guest' | 'member' | 'admin'
export type OrgRole = 'org_member' | 'org_admin'

// ── connecteurs (catalogue, registre source unique) ──
export interface ConnectorMeta {
  name: string
  label: string
  help: string
  href: string | null
  availability: 'self_serve' | 'platform_granted'
  auth_modes: string[]
  personal_session: boolean
  secret_kind: 'api_key' | 'cookie' | 'oauth' | 'refresh_token' | 'none'
  namespaces: string[]
}

// Miroir de access.py::status_for (cascade user > org > platform).
export interface ProviderStatus {
  mode: 'user' | 'org' | 'platform' | 'forbidden' | 'over_quota'
  user_key_configured: boolean
  org_secret_configured: boolean
  platform_key_label: string | null
  quota_used_today: number
  quota_daily: number | null
}

export interface SessionState {
  configured: boolean
  set_at?: string | null
  user_agent?: string | null
  browser_profile?: boolean
}

export interface Me {
  sub: string
  email: string | null
  name: string | null
  role: Role
  active_org: number | null
  active_org_name: string | null
  org_role: OrgRole | null
  linkedin: SessionState
  crunchbase: SessionState
  providers: Record<string, ProviderStatus | undefined>
}

// ── tools / presets ──
export interface ToolEntry {
  name: string
  enabled: boolean
}
export interface PresetEntry {
  name: string
  tool_count: number
  updated_at: string | null
}

// ── doctrine / instructions ──
export interface InstructionMeta {
  slug: string
  title: string
  description: string
  version: number
  updated_at: string | null
}
export interface InstructionDetail extends InstructionMeta {
  body_md: string
  set_by: string | null
  created_at: string | null
}
export interface InstructionVersion {
  version: number
  title: string
  set_by: string | null
  created_at: string | null
}
export interface DoctrineBundle {
  org_id: number | null
  org_name: string | null
  can_edit: boolean
  doctrine: { exists: boolean; version: number; updated_at: string | null }
  instructions: InstructionMeta[]
}

// ── google / datastore / tokens ──
export interface GoogleAccount {
  email: string | null
  is_default: boolean
  scopes: string[]
  granted_at: string | null
}
export interface GoogleOauthStatus {
  connected: boolean
  granted_at: string | null
  scopes: string[]
  accounts?: GoogleAccount[]
}
export interface ApiToken {
  id: number
  label: string
  created_at: string
  last_used_at: string | null
}
export interface WhatsappStatus {
  paired: boolean
  active_pairing: { session_id: string; status: string } | null
}

// MCP fédéré (otomata#16) — statut de connexion OAuth per-user (ex. memento).
export interface MementoStatus {
  connected: boolean
  set_at: string | null
}

// ── orgs ──
export interface Org {
  id: number
  name: string
  member_count?: number
  my_role?: OrgRole
}
export interface OrgMember {
  sub: string
  email: string | null
  name: string | null
  role: OrgRole
  active: boolean
}
export interface OrgSecret {
  provider: string
  base_url?: string | null
  set_at?: string | null
  set_by?: string | null
}
export interface OrgEntitlement {
  namespace: string
  granted_at?: string | null
}
export interface OrgDetail {
  org: Org
  members: OrgMember[]
  secrets: OrgSecret[]
  entitlements?: OrgEntitlement[]
}
export interface OrgInvitation {
  id: number
  email: string
  org_role: OrgRole
  invited_by?: string | null
  created_at?: string | null
  expires_at?: string | null
}

// ── admin ──
export interface AdminGrant {
  platform_key_id: number
  provider: string
  label: string
  granted_at: string
  granted_by: string | null
  daily_quota: number | null
}
export interface AdminUser {
  sub: string
  email: string | null
  name: string | null
  role: Role
  effective_role: Role
  created_at: string
  updated_at: string
  grants: AdminGrant[]
}
// Fiche détaillée d'un user (GET /api/admin/users/{sub}) : accès effectif par
// provider + grants + namespaces, pour la page /console/adminusers/user/:sub.
export interface AdminUserDetail {
  sub: string
  email: string | null
  name: string | null
  role: Role
  active_org: number | null
  providers: Record<string, ProviderStatus | undefined>
  grants: AdminGrant[]
  namespace_grants: NamespaceGrant[]
}
export interface AdminOrgSummary {
  id: number
  name: string
  member_count: number
}
export interface PlatformKey {
  id: number
  provider: string
  label: string
  api_key_tail: string
  created_at: string
}
export interface NamespaceGrant {
  sub: string
  email?: string | null
  name?: string | null
  namespace: string
  granted_at?: string | null
}

// ── monitoring ──
export interface ToolCall {
  id: number
  sub: string | null
  email: string | null
  name: string | null
  tool_name: string
  called_at: string
  duration_ms: number | null
  ok: boolean
  error: string | null
}
export interface MonitoringToolStat {
  tool_name: string
  calls: number
  errors: number
  avg_ms: number | null
}
export interface MonitoringUserStat {
  sub: string | null
  email: string | null
  name: string | null
  calls: number
  errors: number
}
export interface MonitoringDayStat {
  day: string
  calls: number
  errors: number
}
export interface MonitoringSummary {
  since_days: number
  total_calls: number
  error_count: number
  active_users: number
  by_tool: MonitoringToolStat[]
  by_user: MonitoringUserStat[]
  by_day: MonitoringDayStat[]
}

// ── scout (harnais prospection, ADR 0008) ──
export type Heat = 'hot' | 'warm' | 'cold'
export interface ScoutQueueItem {
  fact_id: number
  nom: string
  siren: string
  fit: number
  heat: Heat
  statut: string
}
export interface ScoutContact {
  fact_id: number
  nom: string
  tel?: string | null
  linkedin?: string | null
}
export interface ScoutAction {
  fact_id: number
  created_at: string
  canal: string
  outcome: string
  note?: string | null
}
export interface ScoutDetail {
  fact_id: number
  siren: string
  nom: string
  bp_an?: number | null
  idcc?: string | null
  statut: string
  fit: number
  heat: Heat
  claimed_by?: string | null
  claimed_until?: string | null
  contacts: ScoutContact[]
  actions: ScoutAction[]
}

// MCP endpoint public (config, pas un secret) — affiché tel quel.
export const MCP_URL = (import.meta.env.VITE_LOGTO_AUDIENCE as string) || 'https://mcp.oto.ninja/mcp'

export function fmtDate(iso: string | null | undefined): string | null {
  return iso ? new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
}
export function fmtDateTime(iso: string | null | undefined): string | null {
  return iso ? new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('en-US') : null
}
