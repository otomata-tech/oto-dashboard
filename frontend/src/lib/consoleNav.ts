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

export type NavLevel = 'work' | 'group' | 'org' | 'platform'

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
  // « manage account » (/account) et « activity » (/activity) ne sont PLUS dans la
  // sidebar : ils vivent dans le menu profil du pied (ConsoleUserMenu). Leurs routes
  // sont déclarées explicitement dans le routeur (elles ne dérivent plus de NAV).
  // ── Gérer mon groupe : agir SUR le groupe actif (chef / org_admin) ─────────
  { group: 'nav.section.group', level: 'group', items: [
    { path: '/group', label: 'nav.membersKeys', icon: 'users' },
  ]},
  // ── Gérer mon org : agir SUR l'organisation active ─────────────────────────
  { group: 'nav.section.organization', level: 'org', items: [
    { path: '/org/context', label: 'nav.context', icon: 'bolt' },
    { path: '/org', label: 'nav.membersSecrets', icon: 'users' },
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
  '/activity': { title: 'pageMeta.activity.title', crumb: 'pageMeta.activity.crumb' },
  '/group': { title: 'pageMeta.group.title', crumb: 'pageMeta.group.crumb' },
  '/org/context': { title: 'pageMeta.orgContext.title', crumb: 'pageMeta.orgContext.crumb' },
  '/org': { title: 'pageMeta.org.title', crumb: 'pageMeta.org.crumb' },
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
