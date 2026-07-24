// Client REST typé pour la console — toutes les routes oto-mcp (api_routes*.py).
// Pas de fallback : api() lève sur !ok (cf. CLAUDE.md).
import { api, apiUpload, apiPublic } from '@/api'
import type {
  AdminUser, AdminUserDetail, AdminOrgSummary, AgentContext, AccountProfile, AgentReadme, ApiToken, ConnectorAclEntry, ConnectorActivation, ConnectorInstance, ConnectorMeta, MyConnector, ProviderStatus, SearchHit, Inbox,
  BillingStatus, BillingSubscribeResult, BillingPayment, BillingPlan,
  Project, ProjectLink, ProjectLinkType, ConnectorLinkConfig, ProjectFile, Doc, DocKind, DocRevision, DocChangeRequest, ProjectActivity, ProjectRun,
  DoctrineBundle, Guide, GuideScope,
  GoogleOauthStatus, GroupAclEntry, GroupConnectorActivation, GroupDetail, GroupInstructionsBundle, GroupListItem, GroupRole, InstructionDetail,
  InstructionVersion, LibraryEntry, LibraryDoctrine, Locale, Me, MonitoringSummary,
  MonitoringRestStats, MonitoringConnectorStats, ActivationFunnel,
  ColumnFilter, DatastoreRow, NamespaceEntry, NamespaceShare, Org, OrgDetail, OrgInvitation, OrgRole, PlatformAccess, PlatformKey, ResourceEntry, Role, SharePrincipal, ToolCall, ToolEntry,
  ToolRegistryEntry, ToolDetail, ToolCallResult, VerifyResult, InstructionUsage, DoctrineRun, UsageGap, ToolFeedbackAgg, RunCall, UsageSignal, PlatformInstrBlock,
  MementoStatus, MementoWorkspaces, MementoPages, MementoDocument, UnipileStatus, ConnectorIdentity, AccountGrant, UnipileSeat, InvitePreview,
  InviteResult,
  FieldRule, FieldFiltersBundle, OrgConnectorActivation,
  EmailSettingsBundle, EmailSender, QuietHours, ScheduledEmail,
} from '@/types/api'

const j = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })

// ── identité ──
export const getMe = () => api<Me>('/api/me')
export const putLocale = (locale: Locale) =>
  api<{ locale: Locale }>('/api/me/locale', { method: 'PUT', ...j({ locale }) })
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
// verbose=true : le dashboard rend les cartes complètes (doc/auth/credential_fields).
// L'agent MCP, lui, reçoit une vue compacte par défaut (oto-backend#109).
export const getMyConnectors = () => api<{ connectors: MyConnector[] }>('/api/me/connectors?verbose=true')
// Instances de connecteur visibles (ADR 0038/0044) : mes clés (member) + celles de mes
// équipes/org + prêts « partagés avec moi » + grants plateforme, par proximité.
export const getConnectorInstances = () =>
  api<{ instances: ConnectorInstance[]; count: number }>('/api/me/connector-instances')
// Suspendre / réactiver TA clé membre (lot 2 / ADR 0044 §KeyStack) : mise de côté
// RÉVERSIBLE, la cascade la saute (le niveau du dessous prend le relais). N'écrit
// que meta.suspended — le secret n'est jamais touché. `suspended=false` = réactiver.
// Recherche transverse (lot 3 Ship 1) — le verbe « retrouver », chemin unique
// (même code que MCP oto_search). kinds CSV optionnel, scope projet optionnel.
export const searchAll = (q: string, opts: { scope?: 'org' | 'project'; project?: number; kinds?: string[]; limit?: number } = {}) => {
  const p = new URLSearchParams({ q })
  if (opts.scope) p.set('scope', opts.scope)
  if (opts.project != null) p.set('project', String(opts.project))
  if (opts.kinds?.length) p.set('kinds', opts.kinds.join(','))
  if (opts.limit) p.set('limit', String(opts.limit))
  return api<{ hits: SearchHit[]; count: number; hint?: string }>(`/api/me/search?${p.toString()}`)
}
export const suspendInstance = (connector: string, suspended: boolean, account = '') =>
  api<{ connector: string; account: string | null; suspended: boolean }>(
    '/api/me/connector-instances/suspend',
    { method: 'POST', ...j({ connector, account, suspended }) })
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
// `scope` (défaut 'member') = niveau de l'instance à effacer : ma clé/session perso,
// celle de l'équipe active, ou celle de l'org (org/group réservés aux admins du scope).
export const deleteApiKey = (provider: string, scope: 'member' | 'org' | 'group' = 'member') =>
  api(`/api/settings/api-keys/${provider}${scope !== 'member' ? `?scope=${scope}` : ''}`,
    { method: 'DELETE' })

// Sonde « tester la connexion » (framework de vérification de credential). Résout le
// credential et vérifie qu'il authentifie réellement, en remontant le vrai message
// provider. `level='auto'` (défaut) = le credential effectif ; `level='org'` = la clé
// DE L'ORG consultée (l'en-tête X-Oto-Org est injecté par api()).
export const verifyConnector = (provider: string, level: 'auto' | 'org' = 'auto') =>
  api<VerifyResult>(`/api/me/connectors/${encodeURIComponent(provider)}/verify`,
    { method: 'POST', ...j({ level }) })
// M4 : rejoue le verdict d'un connecteur POUR un membre de l'org active (org admin).
export const getConnectorEffectForMember = (provider: string, member: string) =>
  api<{ provider: string; member: string; status: ProviderStatus | null }>(
    `/api/me/connectors/${encodeURIComponent(provider)}/effect?member=${encodeURIComponent(member)}`)

// ── sessions navigateur (brevo, crunchbase) — Live View Browserbase ──
// Connexion DEPUIS le dashboard : `start` ouvre un navigateur distant et renvoie
// l'URL de Live View (affichée en iframe, l'user se logue) + le couple context/session ;
// `finalize` vérifie le login sur la session vivante et persiste le Context (credential).
// Déconnexion = DELETE générique `deleteApiKey(name)` (même coffre que les clés).
export const startConnectorSession = (name: string) =>
  api<{ live_view_url: string; context_id: string; session_id: string }>(
    `/api/me/connectors/${encodeURIComponent(name)}/session/start`, { method: 'POST' })
// `scope` (défaut 'member') = niveau où poser la session : ma session perso, celle de
// l'équipe active (group) ou de l'org — les niveaux partagés exigent d'être admin du scope
// et un connecteur org-partageable (ex. Pennylane GED : session cabinet mutualisée).
export const finalizeConnectorSession = (
  name: string,
  ctx: { context_id: string; session_id: string; scope?: 'member' | 'org' | 'group' },
) =>
  api<{ connected: boolean; scope: string }>(
    `/api/me/connectors/${encodeURIComponent(name)}/session/finalize`, { method: 'POST', ...j(ctx) })

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
export const getMementoPages = (workspace?: string, cursor?: string) => {
  const q = new URLSearchParams()
  if (workspace) q.set('workspace', workspace)
  if (cursor) q.set('cursor', cursor)
  const qs = q.toString()
  return api<MementoPages>(`/api/memento/pages${qs ? `?${qs}` : ''}`)
}
export const getMementoDocument = (ref: { id?: string; path?: string }) => {
  const q = new URLSearchParams()
  if (ref.id) q.set('id', ref.id)
  if (ref.path) q.set('path', ref.path)
  return api<MementoDocument>(`/api/memento/document?${q.toString()}`)
}

// ── MCP fédéré générique, par connecteur (#40 — atlassian & co.) ──
// Mêmes routes que memento, paramétrées par le nom du connecteur :
// /api/<name>/oauth/{status,start} + DELETE /api/<name>/oauth.
export const getFederatedStatus = (name: string) => api<MementoStatus>(`/api/${name}/oauth/status`)
export const startFederatedOauth = (name: string) => api<{ auth_url: string }>(`/api/${name}/oauth/start`)
export const disconnectFederated = (name: string) => api(`/api/${name}/oauth`, { method: 'DELETE' })

// ── unipile (LinkedIn hébergé) — hosted-auth per-user sous la clé partagée ──
export const getUnipileStatus = () => api<UnipileStatus>('/api/me/unipile')
// `premium` (LinkedIn) = 'recruiter' | 'sales_navigator' : produit à ACTIVER à la
// connexion. Sans lui Unipile ne connecte que `classic` → les APIs premium répondent
// 403 et il faut TOUT reconnecter pour le rattraper. Les deux sont exclusifs.
// Réponse : `{url}` (wizard) OU `{adopted:true, account_name}` — le compte du sub
// déjà connecté dans une autre org (même clé plateforme) a été lié ICI sans wizard.
export const connectUnipile = (channel: string, premium?: string) =>
  api<{ url?: string; adopted?: boolean; account_name?: string | null }>(
    '/api/me/unipile/connect',
    { method: 'POST', ...j(premium ? { channel, premium } : { channel }) })
export const disconnectUnipile = (channel: string) =>
  api(`/api/me/unipile?channel=${encodeURIComponent(channel)}`, { method: 'DELETE' })

// ── sélecteur d'identité connectée générique (ADR 0024) — choisir parmi les
// comptes d'une clé (BYO unipile : LinkedIn de l'équipe ; Google : multi-compte) ──
export const getConnectorIdentities = (connector: string) =>
  api<{ connector: string; supported: boolean; identities: ConnectorIdentity[] }>(
    `/api/connectors/${encodeURIComponent(connector)}/identities`)
export const setConnectorIdentity = (connector: string, identity_id: string) =>
  api(`/api/connectors/${encodeURIComponent(connector)}/identities/default`,
    { method: 'PUT', ...j({ identity_id }) })

// ── autorisation de compte connecteur partagé (#55) — le PROPRIÉTAIRE accorde/
// révoque à un user nommé (email/sub, même hors de ses orgs) le droit d'opérer SON compte ──
export const getAccountGrants = () =>
  api<{ granted_by_me: AccountGrant[]; granted_to_me: AccountGrant[] }>(
    '/api/me/connector-accounts/grants')
export const grantAccountAccess = (channel: string, grantee: string) =>
  api(`/api/me/connector-accounts/${encodeURIComponent(channel)}/grants`,
    { method: 'POST', ...j({ grantee }) })
export const revokeAccountAccess = (channel: string, grantee: string) =>
  api(`/api/me/connector-accounts/${encodeURIComponent(channel)}/grants?grantee=${encodeURIComponent(grantee)}`,
    { method: 'DELETE' })

// ── admin : sièges de la clé plateforme unipile (réconciliation owners) ──
export const getUnipilePlatformSeats = () =>
  api<{ configured: boolean; instance_dsn: string | null; seats: UnipileSeat[]; orphan_count: number }>(
    '/api/admin/unipile/seats')

// ── cli tokens ──
export const getTokens = () => api<{ tokens: ApiToken[] }>('/api/me/tokens')
export const createToken = (label?: string) =>
  api<{ token: string; label: string }>('/api/me/tokens', { method: 'POST', ...j({ label }) })
export const deleteToken = (id: number) => api(`/api/me/tokens/${id}`, { method: 'DELETE' })

// ── tools ──
export const getTools = () => api<{ tools: ToolEntry[] }>('/api/me/tools')
export const disableTool = (name: string) => api(`/api/me/tools/${name}`, { method: 'POST' })
export const enableTool = (name: string) => api(`/api/me/tools/${name}`, { method: 'DELETE' })

// ── procédures / instructions ──
export const getDoctrine = () => api<DoctrineBundle>('/api/me/instructions')
// Contexte agent (otomata-private#49) : instructions serveur + readme/procédures + outils visibles.
export const getAgentContext = () => api<AgentContext>('/api/me/agent-context')

// ── agent readme (niveau USER) — prose injectée à chaque session, cumulée après
// les readme plateforme (bloc A), org (claude_md) et équipe. Édité sur /account.
export const getAgentReadme = () => api<AgentReadme>('/api/me/agent-readme')
export const setAgentReadme = (body_md: string) =>
  api<AgentReadme>('/api/me/agent-readme', { method: 'PUT', ...j({ body_md }) })

// ── profil « situation avec oto » (data model libre, relu à chaque session ; surface
// REST de oto_profile). Édité in-situ dans la section Context. ──
export const getProfile = () => api<AccountProfile>('/api/me/profile')
export const setProfile = (fields: Record<string, string>) =>
  api<AccountProfile>('/api/me/profile', { method: 'PUT', ...j({ fields }) })

// ── Projets (couche d'organisation, ADR 0030) — capacité op-aware oto_project ──
const projectsApi = <T>(body: Record<string, unknown>) =>
  api<T>('/api/me/projects', { method: 'POST', ...j(body) })
export const listProjects = () => projectsApi<{ projects: Project[] }>({ op: 'list' })
// Base de connaissance d'org = zone Documents (remplace Memento) — résout/crée le projet KB.
export const getKbProject = () =>
  api<{ project_id: number; name: string; brief_md: string }>('/api/me/kb', { method: 'POST', ...j({ op: 'get' }) })
// Modèles (templates) copiables visibles par l'acteur — bibliothèque (ADR 0032 §7 B5a).
export const listProjectTemplates = () => projectsApi<{ projects: Project[] }>({ op: 'list_templates' })
export const getProject = (id: number) => projectsApi<Project>({ op: 'get', project_id: id })
// ADR 0049 : owner = scope du projet — org (une de mes orgs), group (pôle/équipe :
// cloisonné à ses membres + admins d'org) ou platform (bibliothèque, admin plateforme).
// ADR 0030 amendé : sans `owner`, le backend crée un projet PERSO (owner=(user, sub))
// dans le contexte de l'org active. `owner` explicite = org/équipe/plateforme (acte
// délibéré) ; `user` reste possible pour être explicite (équivalent à omettre).
export const createProject = (name: string, brief_md = '',
                              owner?: { owner_type: 'user' | 'org' | 'group' | 'platform'; owner_id?: string }) =>
  projectsApi<Project>({ op: 'create', name, brief_md, ...(owner ?? {}) })
export const updateProject = (id: number, fields: { name?: string; brief_md?: string; is_template?: boolean }) =>
  projectsApi<Project>({ op: 'update', project_id: id, ...fields })
// Copie profonde d'un projet (le sien ou un modèle) → nouveau projet dans l'org active (B5a).
export const copyProject = (id: number, name: string) =>
  projectsApi<Project & { copied_from: number; links: ProjectLink[] }>({ op: 'copy', project_id: id, name })
// « Ajouter à mon Oto » (canal d'acquisition) : forke un projet PUBLIÉ par son slug de
// partage dans l'org active, ou RÉCUPÈRE la copie déjà présente (idempotent). Route dédiée
// (≠ op-aware /api/me/projects) — le backend résout la source par slug, jamais par id possédé.
export const importSharedProject = (slug: string) =>
  api<{ project_id: number; imported: boolean; name?: string; reason?: string }>(
    '/api/me/projects/import', { method: 'POST', ...j({ slug }) })
// Publier / retirer un projet comme modèle copiable (B5a).
export const setProjectTemplate = (id: number, is_template: boolean) =>
  projectsApi<Project>({ op: 'update', project_id: id, is_template })
export const archiveProject = (id: number) =>
  projectsApi<{ ok: boolean }>({ op: 'archive', project_id: id })
export const linkProject = (id: number, target_type: ProjectLinkType, target_ref: string, label?: string, role?: string, config?: ConnectorLinkConfig, identity_ref?: string) =>
  projectsApi<{ ok: boolean; links: ProjectLink[] }>({ op: 'link', project_id: id, target_type, target_ref, label, role, config, identity_ref })
export const unlinkProject = (id: number, target_type: ProjectLinkType, target_ref: string, identity_ref?: string) =>
  projectsApi<{ ok: boolean; links: ProjectLink[] }>({ op: 'unlink', project_id: id, target_type, target_ref, identity_ref })
export const getProjectActivity = (id: number) =>
  projectsApi<{ id: number; activity: ProjectActivity[] }>({ op: 'activity', project_id: id })
// Runs d'un projet (ADR 0017), optionnellement filtrés sur une procédure liée
// (target_ref = son id stable) — pastille ok/échec du viewer de procédure.
export const getProjectRuns = (id: number, target_ref?: string) =>
  projectsApi<{ id: number; target_ref?: string; runs: ProjectRun[] }>(
    { op: 'runs', project_id: id, target_ref })
// « Reprendre dans Claude » — blob copier-coller qui pré-écrit oto_use_project (B5b).
export const projectHandoff = (id: number) =>
  projectsApi<{ id: number; markdown: string }>({ op: 'handoff', project_id: id })
// Inventaire DÉRIVÉ du projet (ADR 0035 B4) : refs <tool:> des procédures liées ∪
// usage des runs — préremplit le formulaire publish_mcp (l'humain cure). L'`audit`
// (B5) = liens vérifiés comme des refs : morts / slots non bindés / procédures inertes.
export type ProjectAudit = {
  dead_links: { target_type: string; target_ref: string; slot?: string | null; why: string }[]
  unbound_slots: { procedure: string; ref: string; slots: string[] }[]
  inert_procedures: string[]
}
export const getProjectInventory = (id: number) =>
  projectsApi<{ id: number; tools: string[]; connectors: string[]; connector_sources?: Record<string, string[]>; audit?: ProjectAudit }>({ op: 'inventory', project_id: id })
// Publier / retirer un projet comme endpoint MCP dédié `<slug>.mcp.oto.cx` (ADR 0032, amende #44).
export const publishProjectMcp = (id: number, fields: { mcp_slug: string; mcp_access: 'anonymous' | 'secret' | 'org'; mcp_tools: string[]; mcp_expose_datastore?: boolean; mcp_expose_datastore_write?: boolean }) =>
  projectsApi<Project>({ op: 'publish_mcp', project_id: id, ...fields })
export const unpublishProjectMcp = (id: number) =>
  projectsApi<Project>({ op: 'unpublish_mcp', project_id: id })

// Fichiers bruts d'un projet — carte « Autre document » (ADR 0032 §3, B4a).
export const listProjectFiles = (id: number) =>
  api<{ files: ProjectFile[] }>(`/api/me/projects/${id}/files`)
export const uploadProjectFile = (id: number, file: File) =>
  apiUpload<{ ok: boolean; file: ProjectFile }>(`/api/me/projects/${id}/files`, file)
export const deleteProjectFile = (id: number, fileId: number) =>
  api(`/api/me/projects/${id}/files/${fileId}`, { method: 'DELETE' })
export const setProjectFilePublic = (id: number, fileId: number, isPublic: boolean) =>
  api<{ ok: boolean; file: ProjectFile }>(`/api/me/projects/${id}/files/${fileId}/public`, { method: 'POST', ...j({ public: isPublic }) })

// Docs (incrément 3) — pages markdown d'un projet, op-aware oto_doc
const docsApi = <T>(body: Record<string, unknown>) =>
  api<T>('/api/me/docs', { method: 'POST', ...j(body) })
export const listDocs = (project_id: number) => docsApi<{ project_id: number; docs: Doc[] }>({ op: 'list', project_id })
export const getDoc = (doc_id: number) => docsApi<Doc>({ op: 'get', doc_id })
export const createDoc = (project_id: number, title: string,
  opts?: { parent_id?: number | null; body_md?: string; kind?: DocKind }) =>
  docsApi<Doc>({ op: 'create', project_id, title, ...(opts ?? {}) })
export const updateDoc = (doc_id: number, fields: { title?: string; body_md?: string; kind?: DocKind; description?: string }) =>
  docsApi<Doc>({ op: 'update', doc_id, ...fields })
export const deleteDoc = (doc_id: number) => docsApi<{ ok: boolean }>({ op: 'delete', doc_id })
// Déplacer/réordonner une page (Ship 2) : `position` = INDEX cible (0-based) dans la
// fratrie de destination (le backend réindexe atomiquement) ; `parent_id` absent +
// `position` posé = réordonner dans la fratrie courante ; null = racine du projet.
export const moveDoc = (doc_id: number, opts: { parent_id?: number | null; position?: number }) =>
  docsApi<Doc>({ op: 'move', doc_id, ...opts })
export const getDocRevisions = (doc_id: number) =>
  docsApi<{ doc_id: number; revisions: DocRevision[] }>({ op: 'revisions', doc_id })
// Backlinks « Cité par » (lot 3 Ship 4) : pages qui mentionnent celle-ci via [[…]].
export const getBacklinks = (doc_id: number) =>
  docsApi<{ doc_id: number; backlinks: { id: number; project_id: number; title: string }[]; count: number }>({ op: 'backlinks', doc_id })
// Demandes de modif (gap #4b) — propose (lecture seule) / liste / tranche (owner).
export const requestDocChange = (doc_id: number, fields: { body_md?: string; title?: string; message?: string }) =>
  docsApi<{ ok: boolean; request: DocChangeRequest }>({ op: 'request_change', doc_id, ...fields })
export const listDocChanges = (doc_id: number) =>
  docsApi<{ doc_id: number; requests: DocChangeRequest[] }>({ op: 'list_changes', doc_id })
export const resolveDocChange = (request_id: number, accept: boolean) =>
  docsApi<{ ok: boolean; accepted: boolean; reason?: string }>({ op: 'resolve_change', request_id, accept })
// Propositions en attente d'un PROJET (drawer « Propositions », Ship 3).
export const listProjectProposals = (project_id: number) =>
  docsApi<{ project_id: number; requests: DocChangeRequest[] }>({ op: 'list_changes', project_id })
// Inbox d'accueil (Ship 3) : À traiter (propositions + invitations) / Récent.
export const getInbox = () => api<Inbox>('/api/me/inbox')
// Partage public d'un doc (#4a) — renvoie public + public_url (lien de lecture).
export const setDocPublic = (doc_id: number, isPublic: boolean) =>
  docsApi<{ ok: boolean; public: boolean; public_url: string | null }>({ op: 'set_public', doc_id, public: isPublic })
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
// ── guides on-demand (ADR 0042) : prose how-to chargée à la demande par l'agent
// (oto_guide). Distinct des readmes (injectés) et des procédures (versionnées). ──
export const getGuides = () => api<{ guides: Guide[] }>('/api/me/guides')
export const getGuide = (scope: GuideScope, slug: string) =>
  api<Guide>(`/api/me/guides/${scope}/${encodeURIComponent(slug)}`)
export const setGuide = (scope: GuideScope, slug: string, body_md: string, title?: string, description?: string) =>
  api<Guide>(`/api/me/guides/${scope}/${encodeURIComponent(slug)}`, { method: 'PUT', ...j({ body_md, title, description }) })
export const deleteGuide = (scope: GuideScope, slug: string) =>
  api<{ scope: string; slug: string; deleted: boolean }>(`/api/me/guides/${scope}/${encodeURIComponent(slug)}`, { method: 'DELETE' })
// Registre résolu des tools (ADR 0014) : alimente la résolution des marqueurs
// <tool:slug>, l'autocomplétion @ et le manifeste « outils référencés ».
export const getToolRegistry = () =>
  api<{ tools: ToolRegistryEntry[]; count: number }>('/api/me/tools/registry')
// Fiche détaillée d'un outil (description complète + schémas + testabilité) —
// panneau « en savoir plus » de la fiche connecteur.
export const getToolDetail = (name: string) =>
  api<ToolDetail>(`/api/me/tools/${encodeURIComponent(name)}/detail`)
// Teste un outil open-data en lecture seule sous ta propre identité (le backend
// refuse tout outil à effet de bord). Renvoie le résultat brut (ou l'erreur).
export const callTool = (name: string, args: Record<string, unknown>) =>
  api<ToolCallResult>(`/api/me/tools/${encodeURIComponent(name)}/call`,
    { method: 'POST', ...j({ arguments: args }) })
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

// ── datastore ──
export const getNamespaces = () => api<{ namespaces: NamespaceEntry[] }>('/api/datastore/namespaces')
export const getNamespaceUrl = (ns: string) => api<{ url: string }>(`/api/datastore/namespaces/${ns}/url`)
// owner optionnel (ADR 0030) : { type:'org'|'group', id } pour un classeur d'équipe.
export const createNamespace = (namespace: string, owner?: { type: string; id: string | number }) =>
  api('/api/datastore/namespaces', { method: 'POST', ...j(owner ? { namespace, owner } : { namespace }) })
export const deleteNamespace = (ns: string) =>
  api(`/api/datastore/namespaces/${encodeURIComponent(ns)}`, { method: 'DELETE' })
export interface RowQuery {
  offset?: number; limit?: number; orderBy?: string; orderDir?: 'asc' | 'desc'; q?: string
  filters?: ColumnFilter[]
}
export const getNamespaceRows = (ns: string, opts: RowQuery = {}) => {
  const p = new URLSearchParams()
  if (opts.offset != null) p.set('offset', String(opts.offset))
  if (opts.limit != null) p.set('limit', String(opts.limit))
  if (opts.orderBy) p.set('order_by', opts.orderBy)
  if (opts.orderDir) p.set('order_dir', opts.orderDir)
  if (opts.q) p.set('q', opts.q)
  if (opts.filters?.length) p.set('filters', JSON.stringify(opts.filters))
  const qs = p.toString()
  return api<{ rows: DatastoreRow[]; total: number; offset: number; limit: number }>(
    `/api/datastore/namespaces/${encodeURIComponent(ns)}/rows${qs ? `?${qs}` : ''}`)
}
// Agrégat serveur (ADR 0046 b1) — compteurs du cockpit et tuiles metric, sans
// rapatrier les rows. `metrics` = [{op, field?}] (count/sum/avg/min/max, défaut
// count) ; `q`/`filters` = les MÊMES params que /rows → on agrège le jeu filtré
// affiché. `groups` = [{<groupBy>?: valeur, count?: n, sum_<f>?: n, …}].
export interface AggregateQuery {
  groupBy?: string
  metrics?: Array<{ op: 'count' | 'sum' | 'avg' | 'min' | 'max'; field?: string }>
  q?: string
  filters?: ColumnFilter[]
}
export const getNamespaceAggregate = (ns: string, opts: AggregateQuery = {}) => {
  const p = new URLSearchParams()
  if (opts.groupBy) p.set('group_by', opts.groupBy)
  if (opts.metrics?.length) p.set('metrics', JSON.stringify(opts.metrics))
  if (opts.q) p.set('q', opts.q)
  if (opts.filters?.length) p.set('filters', JSON.stringify(opts.filters))
  const qs = p.toString()
  return api<{ groups: Array<Record<string, unknown>> }>(
    `/api/datastore/namespaces/${encodeURIComponent(ns)}/aggregate${qs ? `?${qs}` : ''}`)
}
// Une row par _id (deep-link `…/item/<rowId>` : la fiche peut être hors page courante).
export const getNamespaceRow = (ns: string, rowId: string) =>
  api<DatastoreRow>(
    `/api/datastore/namespaces/${encodeURIComponent(ns)}/rows/${encodeURIComponent(rowId)}`)
// File de travail (ADR 0046 D) — supervision : rows sous bail (_claimed_by/_claimed_until).
export const getNamespaceQueue = (ns: string) =>
  api<{ rows: DatastoreRow[] }>(`/api/datastore/namespaces/${encodeURIComponent(ns)}/queue`)
// Libération FORCÉE du bail d'une row (humain superviseur — pas de garde de worker).
export const releaseRowClaim = (ns: string, rowId: string) =>
  api<{ ok: boolean; released: boolean; id: string }>(
    `/api/datastore/namespaces/${encodeURIComponent(ns)}/rows/${encodeURIComponent(rowId)}/release`,
    { method: 'POST' })
// Parcours de l'agent d'une row (ADR 0046 b4) : appels data_* du calllog
// corrélés à la fiche + leur run. Fenêtre = rétention calllog (~30 j).
export interface RowActivityEntry {
  created_at: string
  tool: string
  ok: boolean
  error: string | null
  sub: string | null
  email: string | null
  run_id: string | null
  run_label: string | null
  doctrine: string | null
  outcome: string | null
}
export const getRowActivity = (ns: string, rowId: string) =>
  api<{ activity: RowActivityEntry[]; key: string | null; retention_days: number }>(
    `/api/datastore/namespaces/${encodeURIComponent(ns)}/rows/${encodeURIComponent(rowId)}/activity`)
export const renameNamespace = (ns: string, name: string) =>
  api<{ ok: boolean; namespace: string }>(
    `/api/datastore/namespaces/${encodeURIComponent(ns)}`, { method: 'PATCH', ...j({ name }) })
// ── object-browser admin : gouvernance générique des ressources (ADR 0030) ──
// Une seule capacité `oto_resource` (POST /api/resources) op-aware.
export const listResources = (resource_type: string) =>
  api<{ resource_type: string; resources: ResourceEntry[] }>(
    '/api/resources', { method: 'POST', ...j({ op: 'list', resource_type }) })
export const transferResource = (resource_type: string, resource_id: string,
  target: { email?: string; org_id?: number; group_id?: number; confirm?: boolean }) =>
  api('/api/resources', { method: 'POST', ...j({
    op: 'transfer', resource_type, resource_id,
    new_owner_email: target.email, new_owner_org: target.org_id,
    new_owner_group: target.group_id, confirm_transfer: target.confirm }) })
export const getResource = (resource_type: string, resource_id: string) =>
  api<ResourceEntry & { grants: NamespaceShare[] }>(
    '/api/resources', { method: 'POST', ...j({ op: 'get', resource_type, resource_id }) })
export const shareResource = (resource_type: string, resource_id: string, principal: SharePrincipal, role: 'viewer' | 'editor' | 'manager' = 'editor') =>
  api<{ ok: boolean }>('/api/resources', { method: 'POST', ...j({ op: 'share', resource_type, resource_id, ...principal, role }) })
export const unshareResource = (resource_type: string, resource_id: string, principal: SharePrincipal) =>
  api<{ ok: boolean }>('/api/resources', { method: 'POST', ...j({ op: 'unshare', resource_type, resource_id, ...principal }) })
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
export const createMyOrg = (name: string) =>
  api<{ org_id: number; name: string; active_org: number; org_role: string }>(
    '/api/me/orgs', { method: 'POST', ...j({ name }) })
export const getOrg = (id: number) => api<OrgDetail>(`/api/orgs/${id}`)
// MFA obligatoire de l'org : impose un 2ᵉ facteur à TOUS les membres à leur
// prochaine connexion (enforcé par Logto via l'org miroir). Lecture = membre,
// écriture = org_admin. `provisioned` = l'org Logto miroir existe.
export const getOrgMfa = (id: number) =>
  api<{ org_id: number; require_mfa: boolean; provisioned: boolean }>(`/api/orgs/${id}/mfa`)
export const setOrgMfa = (id: number, require: boolean) =>
  api<{ ok: boolean; org_id: number; require_mfa: boolean }>(
    `/api/orgs/${id}/mfa`, { method: 'PUT', ...j({ require }) })
// Profil d'entreprise : chaîne vide = effacer le champ ; `domain` normalisé
// backend (acme.com) et dérive le logo via logo.dev sans upload.
export const updateOrg = (id: number, patch: {
  name?: string; description?: string
  domain?: string; industry?: string; location?: string
}) =>
  api<{ ok: true; org_id: number; name: string; description?: string;
        domain?: string | null; industry?: string; location?: string;
        logo_url?: string | null }>(
    `/api/orgs/${id}`, { method: 'PATCH', ...j(patch) })

// Archive (soft-delete) SON org — org_admin. L'org disparaît de partout, réversible
// en DB ; les membres retombent sur leurs autres orgs. L'espace perso est refusé (400).
export const archiveOrg = (id: number) =>
  api<{ ok: true; org_id: number; archived: boolean }>(
    `/api/orgs/${id}`, { method: 'DELETE' })

// ── email & envoi de l'org — par CONNECTEUR (scaleway hébergé / resend BYOK) ──
// GET = bundle keyé par connecteur (membre) ; PUT = org_admin, ciblé sur UN
// connecteur. Le PUT fait un MERGE JSONB : passer `senders` SEUL ou `quiet_hours`
// SEUL est ok ; les DEUX absents → 400 nothing_to_set ; `quiet_hours` &
// `clear_quiet_hours` exclusifs. Le PUT de `senders` REMPLACE la liste de CE
// connecteur (toujours envoyer la liste complète). Le transport DÉRIVE du connecteur.
export const getOrgEmailSettings = (id: number) =>
  api<EmailSettingsBundle>(`/api/orgs/${id}/email-settings`)
export const setOrgEmailSettings = (
  id: number,
  connector: string,
  patch: { senders?: EmailSender[]; quiet_hours?: QuietHours; clear_quiet_hours?: boolean },
) =>
  api<{ ok: boolean; org_id: number; senders?: EmailSender[]; count?: number; quiet_hours?: QuietHours | null }>(
    `/api/orgs/${id}/email-settings/${encodeURIComponent(connector)}`, { method: 'PUT', ...j(patch) })
export const listScheduledEmails = (id: number, status = 'pending') =>
  api<{ scheduled_emails: ScheduledEmail[] }>(
    `/api/orgs/${id}/scheduled-emails?status=${encodeURIComponent(status)}`)
export const cancelScheduledEmail = (id: number, eid: number) =>
  api<{ ok: boolean; cancelled: number }>(
    `/api/orgs/${id}/scheduled-emails/${eid}`, { method: 'DELETE' })

// ── redaction de champs par connecteur (org_admin, ADR 0015) ──
export const getOrgFieldFilters = (id: number) =>
  api<FieldFiltersBundle>(`/api/orgs/${id}/field-filters?include_schemas=true`)
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
// RBAC connecteur interne à l'org (ADR 0025) : réserver un connecteur à des départements/membres.
export const getConnectorAcl = (id: number) =>
  api<{ org_id: number; access: ConnectorAclEntry[]; restricted: string[] }>(`/api/orgs/${id}/connectors/acl`)
export const setConnectorAccess = (id: number, connector: string, principal_type: string, principal_id: string) =>
  api(`/api/orgs/${id}/connectors/${encodeURIComponent(connector)}/access`,
    { method: 'POST', ...j({ principal_type, principal_id }) })
export const clearConnectorAccess = (id: number, connector: string, principal_type: string, principal_id: string) =>
  api(`/api/orgs/${id}/connectors/${encodeURIComponent(connector)}/access?principal_type=${principal_type}&principal_id=${encodeURIComponent(principal_id)}`,
    { method: 'DELETE' })
// Forcer un connecteur dans la toolbox d'un membre (ADR 0031) — override positif (allow).
export const forceConnectorForMember = (id: number, connector: string, member: string) =>
  api<{ ok: boolean; tools_forced: number }>(
    `/api/orgs/${id}/connectors/${encodeURIComponent(connector)}/force`, { method: 'POST', ...j({ member }) })
// Recommandation d'org (« org propose ») — baseline consultative de connecteurs.
export const setOrgConnectors = (id: number, connectors: string[]) =>
  api<{ org_id: number; recommended: string[] }>(
    `/api/orgs/${id}/default-connectors`, { method: 'PUT', ...j({ connectors }) })

// ── invitations — feature cascade plateforme / org / équipe ──
// Émettre à un niveau = mêmes 3 gestes (lister / inviter / révoquer), une seule
// acceptation commune. ORG :
export const listInvitations = (id: number) =>
  api<{ invitations: OrgInvitation[] }>(`/api/orgs/${id}/invitations`)
// send_email=false → pas d'envoi, le retour porte le code/lien à partager soi-même.
export const inviteMember = (id: number, email: string | null, role: OrgRole, sendEmail = true) =>
  api<InviteResult & { role: string }>(
    `/api/orgs/${id}/invitations`, { method: 'POST', ...j({ email, role, send_email: sendEmail }) })
export const revokeInvitation = (id: number, inviteId: number) =>
  api(`/api/orgs/${id}/invitations/${inviteId}`, { method: 'DELETE' })
// ÉQUIPE (l'invité rejoint l'org parente PUIS l'équipe à l'acceptation) :
export const listGroupInvitations = (id: number) =>
  api<{ invitations: OrgInvitation[] }>(`/api/groups/${id}/invitations`)
export const inviteGroupMember = (id: number, email: string | null, role: GroupRole, sendEmail = true) =>
  api<InviteResult & { role: string }>(
    `/api/groups/${id}/invitations`, { method: 'POST', ...j({ email, role, send_email: sendEmail }) })
export const revokeGroupInvitation = (id: number, inviteId: number) =>
  api(`/api/groups/${id}/invitations/${inviteId}`, { method: 'DELETE' })
// PLATEFORME (admin plateforme — org cible optionnelle : vide = onboarding pur) :
export const listPlatformInvitations = () =>
  api<{ invitations: OrgInvitation[] }>(`/api/admin/invitations`)
export const invitePlatformUser = (
  email: string | null,
  opts: { orgId?: number | null; role?: OrgRole; sendEmail?: boolean } = {},
) =>
  api<InviteResult & { role: string }>(
    `/api/admin/invitations`, { method: 'POST', ...j({
      email, org_id: opts.orgId ?? null, role: opts.role ?? 'org_member',
      send_email: opts.sendEmail ?? true }) })
export const revokePlatformInvitation = (inviteId: number) =>
  api(`/api/admin/invitations/${inviteId}`, { method: 'DELETE' })
// Aperçus publics (sans auth — le code/token EST le secret). Alimentent la page
// d'accueil « vous êtes invité·e » avant la création de compte.
export const previewInvite = (token: string) =>
  apiPublic<InvitePreview>(`/api/invitations/${encodeURIComponent(token)}`)
export const previewInviteByCode = (code: string) =>
  apiPublic<InvitePreview>(`/api/invitations/code/${encodeURIComponent(code)}`)
// Accept par token mail (legacy) ou code court nominatif — commun aux 3 scopes.
export const acceptInvite = (payload: { token?: string; code?: string }) =>
  api<{ ok: boolean; org_id: number | null; org_role: string | null;
        group_id?: number | null; group_role?: string | null;
        name: string | null; self?: boolean }>(
    '/api/me/invitations/accept', { method: 'POST', ...j(payload) })
export const setOrgMemberRole = (id: number, sub: string, role: string) =>
  api(`/api/orgs/${id}/members/${sub}`, { method: 'POST', ...j({ role }) })
export const removeOrgMember = (id: number, sub: string) =>
  api(`/api/orgs/${id}/members/${sub}`, { method: 'DELETE' })
// Auto-retrait : quitter une org dont on est membre (self-service, SUB_ONLY). Refusé sur
// l'org perso ou si on est le dernier admin (409). L'org active bascule côté backend.
export const leaveOrg = (id: number) =>
  api<{ ok: boolean; org_id: number; left: boolean }>(`/api/me/orgs/${id}/membership`, { method: 'DELETE' })
// Pose/rotation de la clé partagée d'org (org_admin, self-service, ADR 0022).
export const setOrgSecret = (id: number, provider: string, api_key: string, base_url?: string, fields?: Record<string, string>) =>
  api<{ ok: boolean; org_id: number; provider: string }>(
    `/api/orgs/${id}/secrets/${provider}`, { method: 'PUT', ...j({ api_key, base_url, fields }) })
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
export const addGroupMember = (id: number, target: string, role: GroupRole) =>
  api(`/api/groups/${id}/members`, { method: 'POST', ...j({ target, role }) })
export const setGroupMemberRole = (id: number, sub: string, role: GroupRole) =>
  api(`/api/groups/${id}/members/${sub}`, { method: 'POST', ...j({ role }) })
export const removeGroupMember = (id: number, sub: string) =>
  api(`/api/groups/${id}/members/${sub}`, { method: 'DELETE' })
// Mono-champ (api_key) OU multi-champs (zoho/silae… → fields), même contrat que la clé d'org.
export const setGroupSecret = (id: number, provider: string, api_key: string, base_url?: string, fields?: Record<string, string>) =>
  api(`/api/groups/${id}/secrets/${provider}`, { method: 'PUT', ...j({ api_key, base_url, fields }) })
export const deleteGroupSecret = (id: number, provider: string) =>
  api(`/api/groups/${id}/secrets/${provider}`, { method: 'DELETE' })
// Disponibilité de connecteur au grain équipe (ADR 0012, restrict-only). L'équipe
// ne peut que COUPER (set enabled=false) / ré-ouvrir (clear) ce que l'org expose.
export const getGroupConnectorActivation = (id: number) =>
  api<{ group_id: number; connectors: GroupConnectorActivation[] }>(`/api/groups/${id}/connectors/activation`)
export const setGroupConnectorActivation = (id: number, name: string, enabled: boolean) =>
  api(`/api/groups/${id}/connectors/${name}/activation`, { method: 'PUT', ...j({ enabled }) })
export const clearGroupConnectorActivation = (id: number, name: string) =>
  api(`/api/groups/${id}/connectors/${name}/activation`, { method: 'DELETE' })
// ACL connecteur au grain équipe (ADR 0012 B2, restrict-only) : réserver un connecteur
// à des membres de l'équipe (narrowing de l'ACL d'org).
export const getGroupConnectorAcl = (id: number) =>
  api<{ group_id: number; access: GroupAclEntry[]; restricted: string[] }>(`/api/groups/${id}/connectors/acl`)
export const setGroupConnectorAccess = (id: number, connector: string, member: string) =>
  api(`/api/groups/${id}/connectors/${connector}/access`, { method: 'POST', ...j({ member }) })
export const clearGroupConnectorAccess = (id: number, connector: string, member: string) =>
  api(`/api/groups/${id}/connectors/${connector}/access?member=${encodeURIComponent(member)}`, { method: 'DELETE' })
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
// ADR 0044 §F : la clé plateforme est une instance du coffre (identité = provider+label,
// plus de surrogate id). Grants keyés par PROVIDER (le connecteur ciblé).
export const getPlatformKeys = () => api<{ platform_keys: PlatformKey[] }>('/api/admin/platform-keys')
export const createPlatformKey = (provider: string, label: string, api_key: string) =>
  api<{ provider: string; label: string }>('/api/admin/platform-keys', { method: 'POST', ...j({ provider, label, api_key }) })
export const deletePlatformKey = (provider: string, label: string) =>
  api(`/api/admin/platform-keys/${encodeURIComponent(provider)}/${encodeURIComponent(label)}`, { method: 'DELETE' })

// platform key grants per-user (accès à la clé plateforme d'un connecteur + quota/jour)
export const grantPlatformKey = (sub: string, provider: string, daily_quota?: number) =>
  api(`/api/admin/users/${sub}/grants/${encodeURIComponent(provider)}`, { method: 'POST', ...j({ daily_quota }) })
export const revokePlatformKey = (sub: string, provider: string) =>
  api(`/api/admin/users/${sub}/grants/${encodeURIComponent(provider)}`, { method: 'DELETE' })

// platform key grants au niveau ORG (couche 2, partage à tous les membres) — super_admin
export const grantOrgPlatformKey = (orgId: number, provider: string, daily_quota?: number) =>
  api(`/api/admin/orgs/${orgId}/grants/${encodeURIComponent(provider)}`, { method: 'POST', ...j({ daily_quota }) })
export const revokeOrgPlatformKey = (orgId: number, provider: string) =>
  api(`/api/admin/orgs/${orgId}/grants/${encodeURIComponent(provider)}`, { method: 'DELETE' })

// option comps (offrir/retirer GRATUITEMENT une option payante — couche abonnement,
// oto-backend/docs/connector-model.md). entity_type user|org, super_admin only.
export const setOptionComp = (entity_type: 'user' | 'org', entity_id: string, option: string, on: boolean) =>
  api('/api/admin/option-comps', { method: 'POST', ...j({ entity_type, entity_id, option, on }) })

// accès plateforme connecteur-centrique (ADR 0044 §H) : « qui, au niveau plateforme, a
// droit à ce connecteur » = grant de clé (couche 2) ∪ option comp (couche 3) en UN acte.
export const getPlatformAccess = (provider: string) =>
  api<PlatformAccess>(`/api/admin/connectors/${encodeURIComponent(provider)}/platform-access`)
export const setPlatformAccess = (provider: string, scope: 'org' | 'user', id: string, on: boolean) =>
  api(`/api/admin/connectors/${encodeURIComponent(provider)}/platform-access`, { method: 'POST', ...j({ scope, id, on }) })

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
// Activité de MON workspace (org active + moi) — l'overview ne montre plus le
// trafic plateforme-wide ni celui des autres membres/orgs (oto/#5.2).
export const getActivitySummary = (days: number) =>
  api<MonitoringSummary>(`/api/me/activity-summary?days=${days}`)
export const getMonitoringRest = (days: number) =>
  api<MonitoringRestStats>(`/api/admin/monitoring/rest?days=${days}`)
export const getMonitoringConnectors = (days: number) =>
  api<MonitoringConnectorStats>(`/api/admin/monitoring/connectors?days=${days}`)
export const getMonitoringFunnel = (days: number) =>
  api<ActivationFunnel>(`/api/admin/monitoring/funnel?days=${days}`)
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

// ── instructions plateforme A/B (#50, admin plateforme) ──
export const getPlatformInstructions = () =>
  api<{ blocks: PlatformInstrBlock[]; keys: string[] }>('/api/admin/platform-instructions')
export const setPlatformInstruction = (key: string, body_md: string) =>
  api<PlatformInstrBlock>(
    `/api/admin/platform-instructions/${encodeURIComponent(key)}`,
    { method: 'PUT', ...j({ body_md }) })

// ── Billing / abonnement par org (ADR 0043) — scopé à l'org active (X-Oto-Org) ──
// Catalogue public des plans (indépendant de l'abonnement) — cockpit admin + achat.
export const getPlans = () => api<{ plans: BillingPlan[] }>('/api/billing/plans')
export const getBilling = () => api<BillingStatus>('/api/me/billing')
export const getBillingPayments = (limit = 20) =>
  api<{ payments: BillingPayment[] }>(`/api/me/billing/payments?limit=${limit}`)
// method='card' → checkout_url = page de paiement ; method='sepa' → page de
// signature du mandat (iban+holder_name+mobile requis, le mobile reçoit l'OTP).
export const subscribeBilling = (body: {
  plan: string; return_url: string; method?: 'card' | 'sepa'
  iban?: string; holder_name?: string; mobile?: string
}) => api<BillingSubscribeResult | BillingStatus>('/api/me/billing/subscribe', { method: 'POST', ...j(body) })
// Polle l'état après retour de la page hébergée (Stancer sans webhooks).
export const confirmBilling = () => api<BillingStatus>('/api/me/billing/confirm', { method: 'POST' })
export const cancelBilling = () => api<BillingStatus>('/api/me/billing/cancel', { method: 'POST' })

// ── Documents légaux (acceptation CGU/CGV/DPA) — journal côté oto-mcp ──
export interface LegalDocState {
  slug: string; version: string; url: string; label: string
  accepted: boolean; accepted_version: string | null; accepted_at: string | null
}
export interface LegalStatus {
  documents: LegalDocState[]
  contexts: Record<string, { required: string[]; outstanding: string[] }>
}
export const getLegal = () => api<LegalStatus>('/api/me/legal')
// context = 'access' (inscription/CGU) | 'purchase' (achat) ; enregistre l'acceptation
// des documents requis du contexte à leur version courante.
export const acceptLegal = (context: string) =>
  api<LegalStatus>('/api/me/legal/accept', { method: 'POST', ...j({ context }) })
// Admin (super_admin) : forcer un plan sur une org sans paiement (plan=null retire).
export const adminSetPlan = (orgId: number, plan: string | null) =>
  api<BillingStatus>(`/api/admin/orgs/${orgId}/plan`, { method: 'POST', ...j({ plan }) })

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
