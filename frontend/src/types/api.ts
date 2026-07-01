// Contrats REST oto-backend (mcp.oto.ninja) consommés par le dashboard.
// Reflètent les handlers de oto-mcp (api_routes*.py) + l'ancien account/src/types.

// Paliers de rôle plateforme (3 crans, ADR rôles) :
//   super_admin > admin (opérateur) > member.
// super_admin = tout-puissant (rôles plateforme, platform keys) ; admin = palier
// OPÉRATIONNEL (voit la section « platform · admin » et la majorité des écrans en
// lecture/gestion, mais ne change PAS les rôles plateforme ni les platform keys).
export type Role = 'member' | 'admin' | 'super_admin'
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
// Section de doc « how-to » d'un connecteur (user-facing, markdown) — rendue
// partout où le connecteur s'affiche. `kind` = type curé (ordre + icône).
export interface DocSection {
  kind: 'prerequisite' | 'setup' | 'usage' | 'note'
  title: string
  body_md: string
}
// Descripteur d'auth unifié (ADR 0024) — source unique du widget credential de
// la ConnectorCard, quel que soit le mécanisme. `method` pilote le widget rendu ;
// `cardinality=multi_account` = N comptes liés (Google) ; `fields` = schéma de
// saisie (vide hors method='secret', où les flux — oauth/cookie/remote — sont dédiés).
export interface AuthDescriptor {
  method: 'secret' | 'oauth' | 'cookie' | 'remote' | 'hosted' | 'none'
  cardinality: 'single' | 'multi_account'
  fields: CredentialField[]
}
export interface ConnectorMeta {
  name: string
  label: string
  help: string
  doc_sections?: DocSection[]  // doc « how-to » user-facing (prérequis/setup/usage), markdown
  href: string | null
  publisher: string          // éditeur affiché (curé) — catalogue
  logo_url: string | null    // logo éditeur (oto-media), null si absent → placeholder
  availability: 'self_serve' | 'platform_granted'
  auth_modes: string[]
  personal_session: boolean
  secret_kind: 'api_key' | 'basic_auth' | 'fields' | 'cookie' | 'oauth' | 'refresh_token' | 'none'
  auth: AuthDescriptor       // ADR 0024 — descripteur d'auth unifié (dérivé de secret_kind/kind)
  namespaces: string[]
  family: string             // axe builder (dérivé) — api|open-data|browser|google|federated|bridge
  category: string           // axe utilisateur (curé) — Prospection|Data FR|…
  credential_fields: CredentialField[]
  free_tier: { daily_quota: number } | null   // ADR 0031 — clé plateforme offerte (quota gratuit/jour/user)
}

// État de sélection marketplace d'un connecteur pour le membre (ADR 0019).
export type ConnectorState = 'not_selected' | 'active' | 'paused'

// Catalogue + état per-membre (GET /api/me/connectors) — source unique du
// marketplace dashboard (library installable + « mes connecteurs »).
export interface MyConnector extends ConnectorMeta {
  state: ConnectorState
  recommended: boolean       // proposé par l'org active (baseline default_connectors)
  doctrine_ref_count?: number  // nb de doctrines de l'org qui le référencent (posture doctrine-only, ADR 0024)
}

// ── bibliothèque publique de doctrines (marketplace, library.*) ──
// Métadonnées d'une entrée publiée (sans body ; `snippet` présent si recherche).
export interface LibraryEntry {
  id: number
  slug: string
  title: string
  description: string
  author_kind: 'otomata' | 'org'
  author_org_id: number | null
  author_display: string
  category: string
  tags: string[]
  visibility: 'public' | 'unlisted'
  version: number
  created_at: string
  updated_at: string
  snippet?: string
}
// Entrée complète (avec le markdown), pour la preview.
export interface LibraryDoctrine extends LibraryEntry {
  body_md: string
  source_org_id: number | null
  source_slug: string | null
  forked_from: number | null
  published_by: string | null
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

// Gouvernance d'activation d'un connecteur, vue côté ORG (cockpit /org/connectors,
// ADR 0022). master_enabled = master plateforme (null = jamais posé = OFF) ;
// org_enabled = override de l'org (null = pas d'override) ; effective = ce que voient
// les membres (override > master > OFF) ; recommended = baseline default_connectors.
export interface OrgConnectorActivation {
  connector: string
  label: string
  help: string
  namespaces: string[]
  master_enabled: boolean | null
  org_enabled: boolean | null
  effective: boolean
  recommended: boolean
  paid_option?: string | null   // option de connecteur (couche 3, ADR 0024) ; null = pas d'option
  subscribed?: boolean          // l'org a l'option débloquée (comp admin)
}

// RBAC connecteur interne à l'org (ADR 0025) : une entrée = un principal (département
// ou membre) autorisé sur un connecteur. ≥1 entrée pour un connecteur ⟹ il est réservé.
export interface ConnectorAclEntry {
  connector: string
  principal_type: 'group' | 'user'
  principal_id: string           // group_id (en texte) ou sub
  granted_by?: string | null
  granted_at?: string
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
  // Connecteurs à session navigateur (cookie/personal_session : brevo, crunchbase) —
  // quand la session a été posée (Live View Browserbase). Absent pour les keyés.
  session_set_at?: string | null
}

export interface Me {
  sub: string
  email: string | null
  name: string | null
  avatar_url: string | null
  role: Role
  active_org: number | null          // org EFFECTIVE affichée = consultation (view-as) ?? maison
  active_org_name: string | null
  active_org_logo_url: string | null
  org_role: OrgRole | null
  home_org: number | null            // org MAISON (défaut MCP des nouvelles conversations)
  home_org_name: string | null
  active_group: number | null        // équipe EFFECTIVE affichée = consultation ?? maison
  active_group_name: string | null
  group_role: GroupRole | null
  home_group: number | null          // équipe MAISON (défaut MCP)
  home_group_name: string | null         // effectif (escalade org_admin/platform incluse)
  access: AccessState                  // gate doux alpha (ADR 0013)
  memento?: MementoStatus              // fédération MCP (otomata#16) — auto-prompt connexion
  providers: Record<string, ProviderStatus | undefined>
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
  email: string | null
  referral: boolean
  inviter: string | null
  org_name: string | null
  exhausted?: boolean   // lien referral : le porteur n'a plus de budget
}

// Lien referral réutilisable du compte (à diffuser au réseau).
export interface ReferralLink {
  referral_code: string
  url: string
  invites_left: number
  active: boolean
}

// Résultat d'une émission d'invitation (directe ou alpha).
export interface InviteResult {
  ok: boolean
  email: string | null
  code: string
  invite_url: string
  emailed: boolean
  invites_left?: number
}

export interface AlphaInvite {
  id: number
  email: string | null
  code?: string | null
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
  id: number
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

// ── contexte agent (otomata-private#49) : ce que le Claude de l'user reçoit ──
export interface AgentDoctrine {
  org_id: number | null
  org: string | null
  doctrine: string
  group_id: number | null
  group: string | null
  group_doctrine: string
  doctrines: { slug: string; title: string; description: string; scope: string }[]
  referenced_tools: { name: string; description?: string }[]
}
export interface AgentToolNamespace {
  namespace: string
  visible: number
  total: number
}
export interface AgentToolsView {
  available: boolean
  total_visible?: number
  total_hidden?: number
  namespaces?: AgentToolNamespace[]
}
export interface AgentContext {
  org_id: number | null
  instructions: string
  doctrine: AgentDoctrine
  tools: AgentToolsView
}

// ── Blocs d'instructions plateforme A/B (#50) — édités par l'admin plateforme ──
export interface PlatformInstrBlock {
  key: string                   // 'secret_sauce' (bloc A)
  body_md: string               // contenu effectif (override DB, ou le seed si jamais édité)
  updated_at: string | null
  updated_by: string | null
  is_seed: boolean              // true = jamais édité, body_md = le défaut du code
  default_md: string            // le défaut du code (bouton « rétablir »)
}

// ── Projets (couche d'organisation, ADR 0030) ──
export type ProjectLinkType = 'tableau' | 'procedure' | 'connecteur' | 'base' | 'page'
// Surcharge contextuelle PRÉFAITE d'un connecteur dans un projet (ADR 0032 §4, B2) :
// quel compte agir + instructions de surcharge en prose, posées au montage du projet,
// lues par l'agent au chargement — jamais déclarées à la volée.
export interface ConnectorLinkConfig {
  identity_id?: string
  instructions_md?: string
}
export interface ProjectLink {
  target_type: ProjectLinkType
  target_ref: string
  identity_ref?: string | null  // connecteur : identité (compte) du binding — clé de multiplicité (#57)
  label?: string | null
  role?: string | null          // pourquoi cette entité est dans le projet (ADR 0032 §2)
  config?: ConnectorLinkConfig | null   // surcharge préfaite du lien (connecteur, ADR 0032 §4)
  cross_project?: boolean        // dérivé : la même entité est liée par ≥1 autre projet
  created_at?: string | null
}
export interface Project {
  id: number
  name: string
  brief_md: string
  owner_type: string
  owner_id: string
  is_template?: boolean          // publié comme modèle copiable (ADR 0032 §7 B5a)
  can_write?: boolean            // droit d'écriture effectif (#4b) ; false → lecture seule
  public_shared?: boolean        // partage public CHIFFRÉ actif (ADR 0032 §3, zero-knowledge)
  public_shared_at?: string | null  // horodatage de la dernière (re)publication chiffrée
  created_at?: string | null
  updated_at?: string | null
  archived_at?: string | null
  links?: ProjectLink[]
}
// Fichier brut d'un projet — carte « Autre document » (ADR 0032 §3, B4a). Blob
// durable en Object Storage ; `download_url` = lien signé expirant (jamais la clé S3).
export interface ProjectFile {
  id: number
  filename: string
  mime?: string | null
  size_bytes?: number | null
  title?: string | null
  description?: string | null
  summary?: string | null
  public?: boolean
  public_url?: string | null     // lien permanent quand public (ADR 0032 §3, B4b)
  created_at?: string | null
  download_url?: string | null
}
export type DocKind = 'doc' | 'note' | 'source'
export interface Doc {
  id: number
  project_id: number
  parent_id: number | null
  title: string
  body_md: string
  kind: DocKind
  public?: boolean               // partagé publiquement (#4a)
  public_url?: string | null     // lien public de lecture quand partagé
  created_at?: string | null
  updated_at?: string | null
}
// Version antérieure d'un Doc (ADR 0032 §3, B4c) — snapshot avant une mise à jour.
export interface DocRevision {
  id: number
  title: string
  body_md: string
  edited_by?: string | null
  created_at?: string | null
}
// Demande de modif d'un Doc (gap #4b) — proposée par un utilisateur en lecture seule.
export interface DocChangeRequest {
  id: number
  doc_id: number
  requested_by?: string | null
  proposed_title?: string | null
  proposed_body_md: string
  message?: string | null
  status: 'pending' | 'accepted' | 'rejected'
  created_at?: string | null
}
export interface ProjectActivity {
  sub: string | null
  action: string
  detail: string | null
  created_at: string | null
}
export interface ResourceGrant {
  principal_type: string
  principal_id: string
  email?: string | null
  permission: string
  granted_at?: string | null
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

// MCP fédéré (otomata#16) — statut de connexion OAuth per-user (ex. memento).
export interface MementoStatus {
  connected: boolean
  set_at: string | null
}

// Carte read-only des KB memento (orientation dashboard ; curation sur me.mento.cc).
export interface MementoWorkspace {
  slug: string
  name: string
  summary: string
  visibility: 'org' | 'private' | 'public'
  myRole: string | null
}
export interface MementoOrg {
  org: string
  name: string
  myRole: string | null
  personal: boolean
  workspaces: MementoWorkspace[]
}
export interface MementoWorkspaces {
  connected: boolean
  default?: string
  orgs: MementoOrg[]
  shared: MementoWorkspace[]
  pinned: MementoWorkspace[]
}

// Datastore (ADR 0016 + primitive d'ownership ADR 0030) — un namespace possédé ou partagé.
export interface NamespaceEntry {
  id: number          // BIGSERIAL stable — handle de deeplink, survit au renommage
  namespace: string
  url: string
  shared: boolean
  created_at?: string | null
  owner_type?: 'user' | 'org' | 'group'
  owner_id?: string
  owner_sub?: string  // legacy (≈ owner_id quand user)
  permission?: string
  can_write?: boolean   // ADR 0030 : droit d'écriture effectif (owner-match ∪ grant write)
  can_govern?: boolean  // ADR 0030 : droit de gouvernance (transfert/partage/suppression)
  is_personal?: boolean // classeur perso (owner_type=user, owner_id=sub)
  schema?: DatastoreSchema | null  // mode typé optionnel (ADR 0032 §6 / 0029) ; null = table libre
}

// Schéma typé d'un namespace (ADR 0032 §6 / 0029, B6) — champs + rôles de rendu.
export type DatastoreFieldRole = 'title' | 'badge' | 'metric' | 'status' | 'qualif' | 'note'
export interface DatastoreField {
  key: string
  label?: string
  type?: 'text' | 'number' | 'date' | 'bool' | 'json'
  role?: DatastoreFieldRole
}
export interface DatastoreSchema {
  fields?: DatastoreField[]
}

// Bénéficiaire d'un partage de namespace (vue propriétaire).
export interface NamespaceShare {
  email: string | null
  permission: string
  principal_type?: string
  principal_id?: string
  created_at?: string | null
}

// Object-browser admin (ADR 0030) — une ressource possédée, plan gouvernance.
export interface ResourceEntry {
  resource_type: string
  resource_id: string
  namespace?: string
  owner_type?: string
  owner_id?: string
  owner_label?: string | null
  row_count?: number
  created_at?: string | null
}

// Une row du datastore : méta à plat (`_id`/`_created_at`/`_updated_at`) + champs
// user arbitraires (schéma libre). Cf. datastore.py::_row_to_dict.
export interface DatastoreRow {
  _id: string
  _created_at?: string | null
  _updated_at?: string | null
  [field: string]: unknown
}

// Filtre par colonne de la vue tableau datastore (oto-dashboard#18). Combinés AND,
// appliqués server-side. Miroir de db._DS_FILTER_OPS.
export type FilterOp =
  | 'contains' | 'eq' | 'ne' | 'in'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'empty' | 'not_empty'
export interface ColumnFilter {
  field: string
  op: FilterOp
  value: string | string[]
}

// Unipile (LinkedIn & WhatsApp hébergés) — l'user connecte SES comptes (account_id
// per-user PAR CANAL) sous la clé Unipile partagée de l'org, sous un abonnement
// commun. channels.<canal>.connected=false → doit faire le hosted-auth de ce canal.
export interface UnipileChannel {
  connected: boolean
  account_id: string | null
  connected_at: string | null
}
export interface UnipileStatus {
  subscribed: boolean       // option débloquée (BYO ou comp admin) — gate l'étape « connecter »
  mode?: string             // user|group|org|platform|over_quota|forbidden (origine de la clé)
  byo?: boolean             // clé propre (user/groupe/org), pas la clé plateforme
  channels: { linkedin: UnipileChannel; whatsapp: UnipileChannel; telegram: UnipileChannel; instagram: UnipileChannel; messenger: UnipileChannel; twitter: UnipileChannel }
}

// Identité connectée d'un connecteur (sélecteur générique, ADR 0024).
export interface ConnectorIdentity {
  id: string
  label: string | null
  status: string
  is_default: boolean
  channel: string | null    // canal (unipile : LINKEDIN/…) ; null hors multi-canal
}

// Siège de la clé plateforme unipile : un compte de l'instance partagée + son
// propriétaire oto (orphan = présent sur l'instance, mappé à aucun user).
export interface UnipileSeat {
  account_id: string
  name: string | null
  type: string | null
  status: string
  owner_sub: string | null
  owner_email: string | null
  org_id: number | null
  org_name: string | null
  orphan: boolean
}

// ── orgs ──
export interface Org {
  id: number
  name: string
  description?: string | null
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
  option_comps?: string[]   // options payantes offertes (comp admin) à l'ORG
  platform_grants?: AdminGrant[]   // clés plateforme partagées à TOUTE l'org (couche 2)
}
// ── redaction de champs par connecteur (FieldFilter, ADR 0015) ──
export interface FieldRule {
  fields: string[]
  action: 'mask' | 'drop' | 'pseudonym' | 'generalize' | 'hash' | 'anonymize'
  // params optionnels selon l'action
  preserve?: 'email' | 'phone' | 'iban'
  keep_first?: number
  keep_last?: number
  kind?: string          // pseudonym
  to?: string            // generalize : year|month|department|range
  step?: number          // generalize range
}
export interface FieldFilterBlock {
  salt?: string
  rules: FieldRule[]
}
export interface FieldActionParam {
  key: string
  type: 'select' | 'int'
  label: string
  options?: string[]
}
export interface FieldActionSchema {
  action: string
  label: string
  params: FieldActionParam[]
}
// Champ de sortie déclaré d'un connecteur (pilote l'onglet « transformations »).
export interface ConnectorFieldSchema {
  name: string
  label?: string
  type?: string
  sensitive?: boolean
}
export interface FieldFilterTemplate {
  label: string
  hint?: string
  rules: FieldRule[]
}
export interface FieldFiltersBundle {
  org_id: number
  filters: Record<string, FieldFilterBlock>   // service -> politique de l'org
  defaults: Record<string, FieldFilterBlock>  // défauts serveur (vide : rien par défaut)
  templates: Record<string, FieldFilterTemplate>  // jeux applicables en 1 clic
  schema: FieldActionSchema[]                 // modes dispo (pilote le formulaire)
  schemas: Record<string, ConnectorFieldSchema[]>  // champs déclarés par connecteur
}

export interface OrgInvitation {
  id: number
  email: string | null
  code?: string | null
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
// provider + grants + namespaces, pour la page /platform/users/:sub.
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
  option_comps: string[]   // options de connecteur offertes (comp admin) à CET user
  unipile_orgs?: AdminUserUnipileOrg[]   // messagerie PAR ORG (l'option est per-org)
}
// État messagerie Unipile d'un user POUR UNE org donnée (un bloc par org dont il est
// membre ; un user peut appartenir à N orgs, l'option est par org). org_id
// null = bloc « hors de ses orgs » (comptes orphelins), subscribed/option_source null.
export interface AdminUserUnipileOrg {
  org_id: number | null
  org_name: string | null
  is_active: boolean
  subscribed: boolean | null
  mode?: string | null
  byo?: boolean | null
  channels: UnipileStatus['channels']
  option_source: {
    user_comp: boolean
    org_comp: boolean
  } | null
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
  p95_ms?: number | null
}

// ── lentilles par kind (ADR 0017, « un seul flux ») ──
export interface MonitoringRouteStat {
  route: string
  calls: number
  errors: number
  avg_ms: number | null
  p95_ms: number | null
}
export interface MonitoringRestStats {
  since_days: number
  total_calls: number
  error_count: number
  active_users: number
  by_route: MonitoringRouteStat[]
}
export interface ConnectorFailureStat {
  provider: string
  failures: number
  users_affected: number
  last_at: string | null
}
export interface MonitoringConnectorStats {
  since_days: number
  total_failures: number
  by_provider: ConnectorFailureStat[]
}
export interface ActivationFunnel {
  window_days: number
  total_accounts: number
  active: number
  rest_only: number
  never_active: number
  blocked_by_connector: number
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

// ── usage / déroulés de doctrine (ADR 0017) ──
export interface DoctrineRun {
  run_id: string
  slug: string | null
  sub: string | null
  started_at: string
  finished_at: string | null
  outcome: string | null      // done | abandoned | failed | blocked (null = en cours)
  n_calls: number
}
export interface UsageGap {
  kind: string                // missing_tool | missing_doctrine | missing_data | other
  intent: string | null       // ce que l'agent voulait faire
  n: number
  last_at: string
}
export interface ToolFeedbackAgg {
  tool: string | null
  kind: string                // bug | misleading_doc | wrong_result | praise | other
  n: number
  last_at: string
}
// Un signal d'usage brut (usage_signals) — le détail derrière un agrégat
// tool-quality/gap (le `body` = le texte du feedback/gap).
export interface UsageSignal {
  id: number
  created_at: string
  signal: string              // tool_feedback | gap
  kind: string
  target: string | null       // nom d'outil (tool_feedback) ou intent (gap)
  body: string | null
  source: string              // agent | human
}
// Un appel dans la timeline d'un déroulé (get_doctrine_run) — colonnes brutes
// tool_calls (tool/created_at), distinct du ToolCall aliasé du monitoring.
export interface RunCall {
  created_at: string
  tool: string
  ok: boolean
  error: string | null
  duration_ms: number | null
}

// ── email & envoi de l'org, PAR CONNECTEUR (ADR 0009, carte connecteur ORG) ──
// Adresses expéditrices déclarées par l'org pour `email_send` + fenêtre calme
// (heures où l'envoi est différé) + file d'envois programmés.
export interface EmailSender {
  email: string
  name?: string
  reply_to?: string
  // plus de `transport` : le transport DÉRIVE du connecteur (cf. EmailSettingsBundle.transports).
}
export interface QuietHours {
  tz: string
  start: number   // heure 0..23
  end: number     // heure 0..23 (wrap minuit ok : start=22/end=7)
}
// Réglages email d'UN connecteur (expéditeurs + fenêtre calme propre).
export interface EmailBlock {
  senders: EmailSender[]
  quiet_hours?: QuietHours        // absente = défaut plateforme à l'envoi
}
// Bundle keyé par connecteur (scaleway = hébergé, resend = BYOK) — le transport
// se déduit du connecteur (transports[connector]).
export interface EmailSettingsBundle {
  org_id: number
  settings: Record<string, EmailBlock>
  connectors: string[]
  transports: Record<string, string>
  quiet_hours_default: QuietHours
  resend_key_set: boolean         // le connecteur resend exige la clé d'org
}
// Colonnes réelles de db.list_scheduled_emails (sans le HTML).
export interface ScheduledEmail {
  id: number
  org_id?: number
  to_email?: string
  subject?: string
  from_email?: string
  from_name?: string
  transport?: string
  status: string                 // pending | sent | failed | cancelled
  scheduled_at: string
  attempts?: number
  sent_at?: string | null
  error?: string | null
  created_at?: string
  created_by?: string
}

// MCP endpoint public (config, pas un secret) — affiché tel quel.
export const MCP_URL = (import.meta.env.VITE_LOGTO_AUDIENCE as string) || 'https://mcp.oto.ninja/mcp'

// Accepte les timestamps PG ("YYYY-MM-DD HH:MM:SS", UTC implicite) ET les ISO
// portant déjà un offset/Z (ex. granted_at = datetime.isoformat() → "…+00:00").
// On n'ajoute "Z" que si la chaîne n'a pas déjà de zone, sinon "…+00:00Z" = invalide.
function parseTs(iso: string): Date {
  const s = iso.replace(' ', 'T')
  return new Date(/(?:Z|[+-]\d\d:?\d\d)$/.test(s) ? s : s + 'Z')
}
export function fmtDate(iso: string | null | undefined): string | null {
  return iso ? parseTs(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
}
export function fmtDateTime(iso: string | null | undefined): string | null {
  return iso ? parseTs(iso).toLocaleString('en-US') : null
}
