// Navigation de la console : trois NIVEAUX d'autorité, un seul axe ordonné.
//
//   • 'work'     (« mon espace »)      = surfaces de consommation, au niveau de
//                                        l'utilisateur. Servies à la RACINE.
//   • 'group'    (« gérer mon groupe ») = agir SUR le groupe actif, réservé au chef
//                                        (group_admin) ou org_admin. Sous /group.
//   • 'org'      (« gérer mon org »)   = agir SUR l'organisation active. Sous /org.
//   • 'platform' (« gérer la plateforme ») = agir sur toute la plateforme, réservé
//                                        à l'opérateur plateforme. Sous /platform.
//
// Le `path` (chemin complet, unique) EST l'identité d'une section : il sert de clé
// au routeur, aux vues (ConsoleLayout) et au surlignage. Pas d'id séparé à tenir
// synchro — « derive don't duplicate ». Le pill « profil actif » (quelle org) est
// l'axe ORTHOGONAL : ne pas le confondre avec le niveau (quoi je fais).

export type NavLevel = 'work' | 'account' | 'group' | 'org' | 'platform'

export interface NavItem {
  path: string
  label: string
  icon: string
  warn?: boolean
  count?: string
  super?: boolean // visible au super_admin seul (action plateforme sensible)
}

export interface NavGroup {
  group: string | null
  level: NavLevel
  items: NavItem[]
}

// NB : `label`/`group`/`title`/`crumb` portent des **clés i18n** (résolues via `t()`
// à l'affichage dans ConsoleSidebar/ConsoleTopbar, réactif au changement de locale) —
// pas du texte. Le `path` reste l'identité brute (routage/surlignage), jamais traduit.
export const NAV: NavGroup[] = [
  // ── Mon espace : consommation, niveau utilisateur (racine) ─────────────────
  { group: null, level: 'work', items: [
    { path: '/overview', label: 'nav.overview', icon: 'home' },
    { path: '/context', label: 'nav.context', icon: 'bolt' },
  ]},
  { group: 'nav.section.workspace', level: 'work', items: [
    { path: '/projects', label: 'nav.projects', icon: 'home' },
    { path: '/connectors', label: 'nav.connectors', icon: 'plug' },
    { path: '/procedures', label: 'nav.procedures', icon: 'doc' },
  ]},
  { group: 'nav.section.memory', level: 'work', items: [
    { path: '/data', label: 'nav.data', icon: 'db' },
    // « documents » = RACCOURCI vers le projet KB de l'org (oto-dashboard#37 : la base
    // de connaissance est un projet, ses pages SONT des documents — plus d'entité à part).
    // /documents résout oto_kb et redirige vers /projects/:id (DocumentsView).
    { path: '/documents', label: 'nav.documents', icon: 'book' },
    // memento masqué (2026-07-02) : on privilégie « documents » comme surface de
    // connaissance. Vue MementoView + endpoints /api/memento/* conservés en sommeil
    // (browse réactivable en réajoutant cette entrée + le master connector_activation).
  ]},
  // ── Gérer mon compte : niveau user-perso (non org-scopé), sa propre sidebar ────
  // Atteint par le menu profil du pied (ConsoleUserMenu) ; une PAGE par sujet au lieu
  // des ex-sous-onglets `?tab=`. « activity » reste hors sidebar (route explicite).
  { group: 'nav.section.account', level: 'account', items: [
    { path: '/account', label: 'nav.profile', icon: 'user' },
    { path: '/account/preferences', label: 'nav.preferences', icon: 'gear' },
    { path: '/account/security', label: 'nav.security', icon: 'shield' },
    { path: '/account/agent', label: 'nav.agent', icon: 'agent' },
    { path: '/account/developers', label: 'nav.developers', icon: 'key' },
  ]},
  // ── Gérer mon équipe : agir SUR l'équipe consultée (chef / org_admin) ──────
  // Scope Team à part entière (parallèle à l'org), pages sous /team/*, pilotées par le
  // préfixe d'URL /o/:org/g/:group/ (repli `me.active_group` si absent). L'id de code
  // reste `group` ; « team » n'est qu'un label produit.
  { group: 'nav.section.team', level: 'group', items: [
    { path: '/team/context', label: 'nav.context', icon: 'bolt' },
    { path: '/team', label: 'nav.membersSecrets', icon: 'users' },
    { path: '/team/connectors', label: 'nav.connectors', icon: 'plug' },
    { path: '/team/procedures', label: 'nav.procedures', icon: 'doc' },
  ]},
  // ── Gérer mon org : agir SUR l'organisation active ─────────────────────────
  // Une PAGE par sujet (plus d'empilement) : contexte · membres · paramètres (profil/
  // logo/entitlements/danger) · sécurité (MFA) · connecteurs · équipes · abonnement.
  { group: 'nav.section.organization', level: 'org', items: [
    { path: '/org/context', label: 'nav.context', icon: 'bolt' },
    { path: '/org', label: 'nav.members', icon: 'users' },
    { path: '/org/settings', label: 'nav.settings', icon: 'gear' },
    { path: '/org/security', label: 'nav.security', icon: 'shield' },
    { path: '/org/connectors', label: 'nav.connectors', icon: 'plug' },
    { path: '/org/teams', label: 'nav.teams', icon: 'users' },
    { path: '/org/billing', label: 'nav.billing', icon: 'card' },
  ]},
  // ── Gérer la plateforme : réservé opérateur plateforme ─────────────────────
  { group: 'nav.section.platformAdmin', level: 'platform', items: [
    { path: '/platform/context', label: 'nav.context', icon: 'bolt' },
    { path: '/platform/monitoring', label: 'nav.monitoring', icon: 'chart' },
    { path: '/platform/usage', label: 'nav.usage', icon: 'pulse' },
    { path: '/platform/users', label: 'nav.usersGrants', icon: 'shield' },
    { path: '/platform/access', label: 'nav.alphaAccess', icon: 'shield' },
    { path: '/platform/orgs', label: 'nav.orgs', icon: 'building' },
    { path: '/platform/objects', label: 'nav.objects', icon: 'db' },
    { path: '/platform/connectors', label: 'nav.connectorsKeys', icon: 'plug' },
    { path: '/platform/instructions', label: 'nav.serverInstructions', icon: 'doc' },
  ]},
]

// ── Helpers dérivés : à quel groupe / niveau appartient un path ─────────────
export function groupOfPath(path: string): NavGroup | undefined {
  return NAV.find((g) => g.items.some((it) => it.path === path))
}
export function levelOf(path: string): NavLevel {
  return groupOfPath(path)?.level ?? 'work'
}

// Valeurs = clés i18n (cf. NAV). Résolues par `t()` dans ConsoleTopbar.
export const PAGE_META: Record<string, { title: string; crumb: string }> = {
  '/overview': { title: 'pageMeta.overview.title', crumb: 'pageMeta.overview.crumb' },
  '/context': { title: 'pageMeta.context.title', crumb: 'pageMeta.context.crumb' },
  '/connectors': { title: 'pageMeta.connectors.title', crumb: 'pageMeta.connectors.crumb' },
  '/procedures': { title: 'pageMeta.procedures.title', crumb: 'pageMeta.procedures.crumb' },
  '/data': { title: 'pageMeta.data.title', crumb: 'pageMeta.data.crumb' },
  '/documents': { title: 'pageMeta.documents.title', crumb: 'pageMeta.documents.crumb' },
  '/account': { title: 'pageMeta.account.title', crumb: 'pageMeta.account.crumb' },
  '/account/preferences': { title: 'pageMeta.accountPreferences.title', crumb: 'pageMeta.accountPreferences.crumb' },
  '/account/security': { title: 'pageMeta.accountSecurity.title', crumb: 'pageMeta.accountSecurity.crumb' },
  '/account/agent': { title: 'pageMeta.accountAgent.title', crumb: 'pageMeta.accountAgent.crumb' },
  '/account/developers': { title: 'pageMeta.accountDevelopers.title', crumb: 'pageMeta.accountDevelopers.crumb' },
  '/activity': { title: 'pageMeta.activity.title', crumb: 'pageMeta.activity.crumb' },
  '/team/context': { title: 'pageMeta.teamContext.title', crumb: 'pageMeta.teamContext.crumb' },
  '/team': { title: 'pageMeta.team.title', crumb: 'pageMeta.team.crumb' },
  '/team/connectors': { title: 'pageMeta.teamConnectors.title', crumb: 'pageMeta.teamConnectors.crumb' },
  '/team/procedures': { title: 'pageMeta.teamProcedures.title', crumb: 'pageMeta.teamProcedures.crumb' },
  '/org/context': { title: 'pageMeta.orgContext.title', crumb: 'pageMeta.orgContext.crumb' },
  '/org': { title: 'pageMeta.org.title', crumb: 'pageMeta.org.crumb' },
  '/org/settings': { title: 'pageMeta.orgSettings.title', crumb: 'pageMeta.orgSettings.crumb' },
  '/org/security': { title: 'pageMeta.orgSecurity.title', crumb: 'pageMeta.orgSecurity.crumb' },
  '/org/connectors': { title: 'pageMeta.orgConnectors.title', crumb: 'pageMeta.orgConnectors.crumb' },
  '/org/teams': { title: 'pageMeta.orgTeams.title', crumb: 'pageMeta.orgTeams.crumb' },
  '/platform/context': { title: 'pageMeta.platformContext.title', crumb: 'pageMeta.platformContext.crumb' },
  '/platform/monitoring': { title: 'pageMeta.platformMonitoring.title', crumb: 'pageMeta.platformMonitoring.crumb' },
  '/platform/usage': { title: 'pageMeta.platformUsage.title', crumb: 'pageMeta.platformUsage.crumb' },
  '/platform/users': { title: 'pageMeta.platformUsers.title', crumb: 'pageMeta.platformUsers.crumb' },
  '/platform/access': { title: 'pageMeta.platformAccess.title', crumb: 'pageMeta.platformAccess.crumb' },
  '/platform/orgs': { title: 'pageMeta.platformOrgs.title', crumb: 'pageMeta.platformOrgs.crumb' },
  '/platform/objects': { title: 'pageMeta.platformObjects.title', crumb: 'pageMeta.platformObjects.crumb' },
  '/platform/connectors': { title: 'pageMeta.platformConnectors.title', crumb: 'pageMeta.platformConnectors.crumb' },
  '/platform/instructions': { title: 'pageMeta.platformInstructions.title', crumb: 'pageMeta.platformInstructions.crumb' },
}
