// Contrats REST oto-backend (mcp.oto.ninja) consommés par le dashboard.
// Reflètent les handlers de oto-mcp (api_routes*.py) + l'ancien account/src/types.

export type Role = 'member' | 'admin'
export type OrgRole = 'org_member' | 'org_admin'
export type GroupRole = 'group_member' | 'group_admin'   // chef d'équipe = group_admin

// ── connecteurs (catalogue, registre source unique) ──
// Un champ de saisie d'un credential (modèle générique multi-champs, ADR 0011) —
// le formulaire « configure » se rend en bouclant dessus. `secret` = champ masqué.
export interface CredentialField {
  name: string
  label: string
  secret: boolean
}
export interface ConnectorMeta {
  name: string
  label: string
  help: string
  href: string | null
  availability: 'self_serve' | 'platform_granted'
  auth_modes: string[]
  personal_session: boolean
  secret_kind: 'api_key' | 'basic_auth' | 'fields' | 'cookie' | 'oauth' | 'refresh_token' | 'none'
  namespaces: string[]
  credential_fields: CredentialField[]
}

// Cran d'activation des connecteurs (ADR 0010, admin). `enabled` null = jamais
// posé → OFF (deny-by-default). `overrides` = exceptions par org.
export interface ConnectorActivation {
  connector: string
  label: string
  help: string
  namespaces: string[]
  enabled: boolean | null
  overrides: { org_id: number; enabled: boolean }[]
}

// Miroir de access.py::status_for (cascade user > group > org > platform).
export interface ProviderStatus {
  mode: 'user' | 'group' | 'org' | 'platform' | 'forbidden' | 'over_quota'
  user_key_configured: boolean
  group_secret_configured?: boolean
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
  avatar_url: string | null
  role: Role
  active_org: number | null
  active_org_name: string | null
  active_org_logo_url: string | null
  org_role: OrgRole | null
  active_group: number | null
  active_group_name: string | null
  group_role: GroupRole | null         // effectif (escalade org_admin/platform incluse)
  access: AccessState                  // gate doux alpha (ADR 0013)
  linkedin: SessionState
  crunchbase: SessionState
  memento?: MementoStatus              // fédération MCP (otomata#16) — auto-prompt connexion
  providers: Record<string, ProviderStatus | undefined>
  billing: BillingBalance | null    // wallet de credits de l'org active (null si pas d'org)
}

// ── billing (credits d'appel par org, paiement Stripe) ──
export interface BillingBalance {
  balance: number           // credits d'appel restants ; peut être négatif (soft)
  low: boolean              // solde bas/négatif → alerte UI
  base_granted: boolean     // le stock de base gratuit a été crédité
}
export interface CreditPack {
  pack_id: string
  calls: number
  amount_cents: number
  label: string
}
export interface CreditTransaction {
  id: number
  delta: number             // >0 = recharge/don, <0 = ajustement
  reason: string            // 'stripe' | 'base_grant' | 'admin_adjust'
  stripe_event_id: string | null
  created_at: string
}

// Accès plateforme alpha (ADR 0013) : status = gate doux, invites_left = budget
// referral restant, invited_by = parrain.
export interface AccessState {
  status: 'pending' | 'active' | 'blocked' | null
  invites_left: number
  invited_by: string | null
}

export interface WaitlistEntry {
  sub: string
  email: string | null
  name: string | null
  created_at: string
}

export interface InvitePreview {
  email: string
  referral: boolean
  inviter: string | null
  org_name: string | null
}

export interface AlphaInvite {
  id: number
  email: string
  invited_by: string | null
  source: string | null
  created_at: string
  expires_at: string
}

// ── tools / presets ──
export interface ToolEntry {
  name: string
  enabled: boolean
}
// Entrée du registre résolu (ADR 0014). `source` = native (in-process oto) ou
// federated (MCP tiers monté) ; `mcp` = nom du connecteur fédéré le cas échéant.
export interface ToolRegistryEntry {
  name: string
  description: string
  source: 'native' | 'federated'
  mcp?: string
}
// Usage d'une doctrine : nb de chargements par l'agent, appelants, série 30j.
export interface InstructionUsage {
  slug: string
  count: number
  callers: string[]
  series: number[]
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

// Datastore (ADR 0016) — un namespace possédé ou partagé.
export interface NamespaceEntry {
  namespace: string
  url: string
  shared: boolean
  created_at?: string | null
  owner_sub?: string
  permission?: string
}

// Unipile (LinkedIn hébergé) — l'user connecte SON LinkedIn (account_id per-user)
// sous la clé Unipile partagée de l'org. connected=false → doit faire le hosted-auth.
export interface UnipileStatus {
  subscribed: boolean       // option LinkedIn payée (abonnement actif) — gate l'étape « connecter »
  connected: boolean
  account_id: string | null
  connected_at: string | null
}

// ── orgs ──
export interface Org {
  id: number
  name: string
  logo_url?: string | null
  member_count?: number
  my_role?: OrgRole
}
export interface OrgMember {
  sub: string
  email: string | null
  name: string | null
  avatar_url?: string | null
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

// ── groupes (départements / équipes, ADR 0012) ──
export interface GroupListItem {
  id: number
  group_id: number
  name: string
  description: string
  member_count: number
  my_role: GroupRole | null
  active: boolean
}
export interface GroupBrief {
  id: number
  group_id: number
  org_id: number
  name: string
  description: string
  member_count: number
  has_preset: boolean
  my_role: GroupRole | null
}
export interface GroupMember {
  sub: string
  email: string | null
  name: string | null
  role: GroupRole
  active: boolean
}
export interface GroupSecret {
  provider: string
  base_url?: string | null
  set_at?: string | null
  set_by?: string | null
}
export interface GroupDetail {
  group: GroupBrief
  default_tools: string[] | null     // preset de toolset ; null = pas de baseline
  members: GroupMember[]
  secrets: GroupSecret[]
}
export interface GroupInstructionsBundle {
  group_id: number
  doctrine: string
  doctrine_version: number | null
  instructions: InstructionMeta[]
  can_edit: boolean
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
export interface AdminUserOrg {
  org_id: number
  name: string
  org_role: OrgRole
  is_active: boolean
  joined_at: string
}
export interface AdminUserDetail {
  sub: string
  email: string | null
  name: string | null
  role: Role
  active_org: number | null
  access_status: string | null
  pending_invite: { id: number; created_at: string; expires_at: string } | null
  orgs: AdminUserOrg[]
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
