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
  // Réservé à l'admin d'org. Sans ce cran, ouvrir un chemin d'org à un membre
  // simple (#160 : l'abonnement, dont les LECTURES lui sont servies) lui afficherait
  // les six autres entrées du niveau, qu'il ne peut pas utiliser — on remplacerait
  // « aucune porte » par « six portes fermées ». La sidebar ne filtrait que par
  // niveau, jamais par droits ; c'est la décision actée en #51, jamais appliquée.
  orgAdmin?: boolean
  plomberie?: boolean // rendu ANCRÉ EN BAS (zone plomberie de l'agent, refonte nav pt 4)
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
    // Plomberie de l'agent : subordonnée aux projets, ancrée en bas (refonte nav pt 4).
    { path: '/connectors', label: 'nav.connectors', icon: 'plug', plomberie: true },
    { path: '/procedures', label: 'nav.procedures', icon: 'doc', plomberie: true },
    // Automatisations : QUAND l'agent part tout seul, là où « procédures » dit CE
    // qu'il fait. Même étage de plomberie, juste après, parce qu'une automatisation
    // déroule une procédure.
    { path: '/automations', label: 'nav.automations', icon: 'bolt', plomberie: true },
  ]},
  { group: 'nav.section.memory', level: 'work', items: [
    { path: '/data', label: 'nav.data', icon: 'db' },
    // Entrée « Documents » RETIRÉE (oto/#5.5) : c'était un raccourci vers le projet KB
    // de l'org — redondant (la KB est un projet, atteignable via « Projets ») et source
    // de confusion. /documents (route + DocumentsView) survit pour un
    // lien direct éventuel, mais n'est plus dans la sidebar.
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
    { path: '/org', label: 'nav.members', icon: 'users', orgAdmin: true },
    { path: '/org/settings', label: 'nav.settings', icon: 'gear', orgAdmin: true },
    { path: '/org/security', label: 'nav.security', icon: 'shield', orgAdmin: true },
    { path: '/org/connectors', label: 'nav.connectors', icon: 'plug', orgAdmin: true },
    { path: '/org/teams', label: 'nav.teams', icon: 'users', orgAdmin: true },
    // Supervision de l'org (org_admin) : mêmes lentilles que /platform/monitoring,
    // bornées à ce qui a été émis sous cette org.
    { path: '/org/monitoring', label: 'nav.monitoring', icon: 'chart', orgAdmin: true },
    // PAS `orgAdmin` : les lectures de cet écran sont servies à tout membre
    // (`billing.status`, `billing.payments`, `me.billing.invoices.list`,
    // `me.billing.identity.get` = ORG_MEMBER ; le catalogue des offres = tout
    // connecté). Seules les écritures exigent l'admin, et l'écran les masque déjà.
    { path: '/org/billing', label: 'nav.billing', icon: 'card' },
  ]},
  // ── Gérer la plateforme : réservé opérateur plateforme ─────────────────────
  // Refonte 2026-07-23 : /platform/instructions absorbé par le context (B5),
  // /platform/usage fusionné dans la supervision (onglet « signaux d'usage »).
  { group: 'nav.section.platformAdmin', level: 'platform', items: [
    { path: '/platform/context', label: 'nav.context', icon: 'bolt' },
    { path: '/platform/monitoring', label: 'nav.monitoring', icon: 'chart' },
    { path: '/platform/users', label: 'nav.usersGrants', icon: 'shield' },
    { path: '/platform/orgs', label: 'nav.orgs', icon: 'building' },
    // Étage d'identité au-dessus des orgs (ADR 0052) — suivi seul : qui est servi,
    // sous quel émetteur, avec quelle empreinte. Le provisionnement reste un runbook.
    { path: '/platform/tenants', label: 'nav.tenants', icon: 'shield' },
    { path: '/platform/objects', label: 'nav.objects', icon: 'db' },
    { path: '/platform/connectors', label: 'nav.connectorsKeys', icon: 'plug' },
    // Relance des comptes inactifs. Visible à tout opérateur plateforme : lire
    // l'audience et le journal est une lentille de supervision. Ce qui FAIT PARTIR
    // un mail est réservé au super_admin, et se gate DANS la vue — marquer la
    // section `super` la cacherait à qui a le droit de la consulter.
    { path: '/platform/outreach', label: 'nav.outreach', icon: 'mail' },
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
  '/search': { title: 'pageMeta.search.title', crumb: 'pageMeta.search.crumb' },
  '/projects': { title: 'pageMeta.projects.title', crumb: 'pageMeta.projects.crumb' },
  '/connectors': { title: 'pageMeta.connectors.title', crumb: 'pageMeta.connectors.crumb' },
  '/procedures': { title: 'pageMeta.procedures.title', crumb: 'pageMeta.procedures.crumb' },
  '/data': { title: 'pageMeta.data.title', crumb: 'pageMeta.data.crumb' },
  '/documents': { title: 'pageMeta.documents.title', crumb: 'pageMeta.documents.crumb' },
  // ⚠️ Une page absente de cette table retombe SILENCIEUSEMENT sur l'overview :
  // la topbar affichait « overview » sur /automations, alors que ses libellés
  // existaient déjà dans les locales (constaté le 2026-08-28). Toute entrée de
  // NAV doit avoir sa ligne ici — le repli n'est pas un défaut acceptable, il
  // fait mentir le titre de la page.
  '/automations': { title: 'pageMeta.automations.title', crumb: 'pageMeta.automations.crumb' },
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
  '/org/billing': { title: 'pageMeta.orgBilling.title', crumb: 'pageMeta.orgBilling.crumb' },
  '/org/security': { title: 'pageMeta.orgSecurity.title', crumb: 'pageMeta.orgSecurity.crumb' },
  '/org/connectors': { title: 'pageMeta.orgConnectors.title', crumb: 'pageMeta.orgConnectors.crumb' },
  '/org/teams': { title: 'pageMeta.orgTeams.title', crumb: 'pageMeta.orgTeams.crumb' },
  '/org/monitoring': { title: 'pageMeta.orgMonitoring.title', crumb: 'pageMeta.orgMonitoring.crumb' },
  '/platform/context': { title: 'pageMeta.platformContext.title', crumb: 'pageMeta.platformContext.crumb' },
  '/platform/monitoring': { title: 'pageMeta.platformMonitoring.title', crumb: 'pageMeta.platformMonitoring.crumb' },
  '/platform/users': { title: 'pageMeta.platformUsers.title', crumb: 'pageMeta.platformUsers.crumb' },
  '/platform/orgs': { title: 'pageMeta.platformOrgs.title', crumb: 'pageMeta.platformOrgs.crumb' },
  '/platform/tenants': { title: 'pageMeta.platformTenants.title', crumb: 'pageMeta.platformTenants.crumb' },
  '/platform/objects': { title: 'pageMeta.platformObjects.title', crumb: 'pageMeta.platformObjects.crumb' },
  '/platform/connectors': { title: 'pageMeta.platformConnectors.title', crumb: 'pageMeta.platformConnectors.crumb' },
  '/platform/outreach': { title: 'pageMeta.platformOutreach.title', crumb: 'pageMeta.platformOutreach.crumb' },
}
