// Navigation de la console : trois NIVEAUX d'autorité, un seul axe ordonné.
//
//   • 'work'     (« mon espace »)      = surfaces de consommation, au niveau de
//                                        l'utilisateur. Servies à la RACINE.
//   • 'org'      (« gérer mon org »)   = agir SUR l'organisation active. Sous /org.
//   • 'platform' (« gérer la plateforme ») = agir sur toute la plateforme, réservé
//                                        à l'opérateur plateforme. Sous /platform.
//
// Le `path` (chemin complet, unique) EST l'identité d'une section : il sert de clé
// au routeur, aux vues (ConsoleLayout) et au surlignage. Pas d'id séparé à tenir
// synchro — « derive don't duplicate ». Le pill « profil actif » (quelle org) est
// l'axe ORTHOGONAL : ne pas le confondre avec le niveau (quoi je fais).

import { META_ESPACE } from './automationsEspace'
import { sectionHorsVue } from './vueBornee'

// 'team' (« gérer mon équipe ») : agir SUR une équipe donnée — ses membres, ses
// connecteurs. Retiré avec tout le niveau équipe (oto#192), revenu le 18/09 : un chef
// d'équipe qui n'est pas admin d'org n'avait AUCUNE porte vers ce qu'il a le droit de
// gérer (poser la clé d'un connecteur pour son équipe) — la liste des équipes vit sous
// « gérer mon org », qu'il ne voit pas. Les pages restent sous /org/teams/:id.
export type NavLevel = 'work' | 'account' | 'org' | 'platform' | 'team'

// Le niveau équipe vise UNE équipe : ses chemins portent ce jeton, résolu par la sidebar
// depuis la route (`teamPath`). Une entrée de nav reste un chemin unique et nommé.
export const TEAM_TOKEN = '{groupId}'
export function teamPath(path: string, groupId: string): string {
  return path.replace(TEAM_TOKEN, groupId)
}

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
  // Visible de qui voit l'administration d'org (`seesOrgAdministration` : l'admin d'org, et
  // l'opérateur plateforme, à qui le serveur en sert les lectures).
  orgAdmin?: boolean
  // Écran dont les LECTURES mêmes exigent l'admin d'org (`ORG_ADMIN_OF` côté serveur) :
  // l'opérateur plateforme n'y lirait qu'un refus, même en consultation (oto#210).
  orgAdminReads?: boolean
  plomberie?: boolean // rendu ANCRÉ EN BAS (zone plomberie de l'agent, refonte nav pt 4)
  // Page de DÉTAIL (`route.meta.detail`) : c'est elle qui dit « on est ici », pas la
  // section — les deux pages d'une équipe partagent la section /org/teams.
  detail?: string
}

export interface NavGroup {
  group: string | null
  level: NavLevel
  items: NavItem[]
}

/** Les droits du lecteur qui filtrent le menu — calculés par `useMe`, lus ici sans lui. */
export interface NavRights {
  superAdmin: boolean
  seesOrgAdministration: boolean
  orgAdmin: boolean
}

export function navItemVisible(it: NavItem, r: NavRights): boolean {
  return (!it.super || r.superAdmin)
    && (!it.orgAdmin || r.seesOrgAdministration)
    && (!it.orgAdminReads || r.orgAdmin)
    // Vue bornée d'un org_admin (oto#270) : un écran dont les lectures y sont refusées
    // n'a pas de porte (`lib/vueBornee`, la seule liste).
    && !sectionHorsVue(it.path)
}

// NB : `label`/`group`/`title`/`crumb` portent des **clés i18n** (résolues via `t()`
// à l'affichage dans ConsoleSidebar/ConsoleTopbar, réactif au changement de locale) —
// pas du texte. Le `path` reste l'identité brute (routage/surlignage), jamais traduit.
export const NAV: NavGroup[] = [
  // ── Mon espace : consommation, niveau utilisateur (racine) ─────────────────
  { group: null, level: 'work', items: [
    { path: '/overview', label: 'nav.overview', icon: 'home' },
    { path: '/context', label: 'nav.context', icon: 'bolt' },
    // Abonnement — décision d'Alexis (04/09) : « dans le menu, pas dans le sélecteur
    // d'org ». Il vivait dans le popover d'identité (#160), seul endroit d'où un
    // MEMBRE SIMPLE pouvait l'atteindre : la section « Gérer mon org » ci-dessous ne
    // s'affiche qu'une fois DÉJÀ dans la zone org, où seul un admin entre.
    // ⚠️ C'est pourquoi l'entrée est ici, au niveau `work`, et pas seulement retirée
    // du popover : la retirer sans la reposer refermerait la porte que #160 a ouverte
    // — un membre à qui cet écran est SERVI (ses factures, ses paiements) et qui n'y
    // accédait qu'en connaissant l'URL.
    // Pas de `orgAdmin` : les lectures sont servies à tout membre, l'écran masque
    // déjà les écritures qui demandent l'admin.
    { path: '/org/billing', label: 'nav.billing', icon: 'card' },
  ]},
  { group: 'nav.section.workspace', level: 'work', items: [
    { path: '/projects', label: 'nav.projects', icon: 'home' },
    // Données : le groupe « mémoire » ne contenait plus qu'elles (oto#193) — un titre
    // de section au-dessus d'une seule entrée, qui promettait une mémoire plus large
    // que ce qu'il montrait. Aplati ici, à côté des projets.
    // Entrée « Documents » RETIRÉE (oto/#5.5) : c'était un raccourci vers le projet
    // d'org qui porte les documents — redondant (c'est un projet, atteignable via
    // « Projets ») et source de confusion. /documents (route + DocumentsView) survit
    // pour un lien direct éventuel, mais n'est plus dans la sidebar.
    { path: '/data', label: 'nav.data', icon: 'db' },
    // Plomberie de l'agent : subordonnée aux projets, ancrée en bas (refonte nav pt 4).
    { path: '/connectors', label: 'nav.connectors', icon: 'plug', plomberie: true },
    { path: '/procedures', label: 'nav.procedures', icon: 'doc', plomberie: true },
    // Automatisations : QUAND l'agent part tout seul, là où « procédures » dit CE
    // qu'il fait. Même étage de plomberie, juste après, parce qu'une automatisation
    // déroule une procédure.
    { path: '/automations', label: 'nav.automations', icon: 'bolt', plomberie: true },
  ]},
  // ── Gérer mon compte : niveau user-perso (non org-scopé), sa propre sidebar ────
  // Atteint par le menu profil du pied (ConsoleUserMenu) ; une PAGE par sujet au lieu
  // des ex-sous-onglets `?tab=`.
  { group: 'nav.section.account', level: 'account', items: [
    { path: '/account', label: 'nav.profile', icon: 'user' },
    { path: '/account/preferences', label: 'nav.preferences', icon: 'gear' },
    { path: '/account/security', label: 'nav.security', icon: 'shield' },
    { path: '/account/agent', label: 'nav.agent', icon: 'agent' },
    // Son abonnement Claude (Pro/Max) branché pour ses agents : palier membre, jamais l'org.
    { path: '/account/claude', label: 'nav.claudeSubscription', icon: 'bot' },
    { path: '/account/developers', label: 'nav.developers', icon: 'key' },
  ]},
  // ── Niveau équipe RETIRÉ (oto#192, 12/09/2026) : contexte, membres, connecteurs et
  // procédures d'une équipe — un utilisateur, un jour d'usage en 45 jours. Les équipes
  // restent listées, créées et renommées dans /org/teams, et consultables par le préfixe
  // d'URL /o/:org/g/:group/ sur les écrans de travail.
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
    // bornées à ce qui a été émis sous cette org. Ses lectures sont `ORG_ADMIN_OF` :
    // l'opérateur plateforme n'y lirait qu'un refus (oto#210).
    { path: '/org/monitoring', label: 'nav.monitoring', icon: 'chart', orgAdmin: true, orgAdminReads: true },
    // ⚠️ `/org/billing` n'est PLUS listé ici : il est monté au niveau `work`
    // (04/09). Le garder aux deux endroits en ferait deux entrées du même menu
    // pointant la même page — et la section « org » ne le servait de toute façon
    // qu'à qui savait déjà y entrer.
  ]},
  // ── Gérer mon équipe : agir SUR l'équipe consultée (chef d'équipe / org_admin) ──
  // Pas de cran de droit ici : on n'arrive à ce niveau que par une page d'équipe, et le
  // serveur ne sert ces pages qu'à qui peut les lire (membre de l'org) ; les gestes s'y
  // gardent eux-mêmes (`canManage`).
  { group: 'nav.section.team', level: 'team', items: [
    { path: `/org/teams/${TEAM_TOKEN}`, label: 'nav.members', icon: 'users', detail: 'team' },
    { path: `/org/teams/${TEAM_TOKEN}/connectors`, label: 'nav.connectors', icon: 'plug', detail: 'team-connectors' },
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

// Titre et fil d'une page de DÉTAIL, par `meta.detail` : ils passent devant ceux de la section.
// Les pages de l'espace Automatisations (oto#214) viennent de sa liste, `lib/automationsEspace`.
export const DETAIL_META: Record<string, { title: string; crumb: string }> = {
  'admin-user': { title: 'pageMeta.adminUser.title', crumb: 'pageMeta.adminUser.crumb' },
  'admin-org': { title: 'pageMeta.adminOrg.title', crumb: 'pageMeta.adminOrg.crumb' },
  'team': { title: 'pageMeta.team.title', crumb: 'pageMeta.team.crumb' },
  'team-connectors': { title: 'pageMeta.teamConnectors.title', crumb: 'pageMeta.teamConnectors.crumb' },
  ...META_ESPACE,
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
  '/account/claude': { title: 'pageMeta.accountClaude.title', crumb: 'pageMeta.accountClaude.crumb' },
  '/account/developers': { title: 'pageMeta.accountDevelopers.title', crumb: 'pageMeta.accountDevelopers.crumb' },
  '/org/context': { title: 'pageMeta.orgContext.title', crumb: 'pageMeta.orgContext.crumb' },
  '/org': { title: 'pageMeta.org.title', crumb: 'pageMeta.org.crumb' },
  '/org/settings': { title: 'pageMeta.orgSettings.title', crumb: 'pageMeta.orgSettings.crumb' },
  '/org/billing': { title: 'pageMeta.orgBilling.title', crumb: 'pageMeta.orgBilling.crumb' },
  '/org/security': { title: 'pageMeta.orgSecurity.title', crumb: 'pageMeta.orgSecurity.crumb' },
  '/org/connectors': { title: 'pageMeta.orgConnectors.title', crumb: 'pageMeta.orgConnectors.crumb' },
  '/org/teams': { title: 'pageMeta.orgTeams.title', crumb: 'pageMeta.orgTeams.crumb' },
  // Les deux pages du niveau équipe : leur titre vient de DETAIL_META (page de détail) ;
  // ces entrées tiennent la règle « tout écran de la nav a son titre ».
  [`/org/teams/${TEAM_TOKEN}`]: { title: 'pageMeta.team.title', crumb: 'pageMeta.team.crumb' },
  [`/org/teams/${TEAM_TOKEN}/connectors`]: { title: 'pageMeta.teamConnectors.title', crumb: 'pageMeta.teamConnectors.crumb' },
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
