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

export type NavLevel = 'work' | 'org' | 'platform'

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

export const NAV: NavGroup[] = [
  // ── Mon espace : consommation, niveau utilisateur (racine) ─────────────────
  { group: null, level: 'work', items: [
    { path: '/overview', label: 'overview', icon: 'home' },
    { path: '/context', label: 'context', icon: 'bolt' },
  ]},
  { group: 'workspace', level: 'work', items: [
    { path: '/projects', label: 'projects', icon: 'home' },
    { path: '/connectors', label: 'connectors', icon: 'plug' },
    { path: '/procedures', label: 'procédures', icon: 'doc' },
  ]},
  { group: 'memory', level: 'work', items: [
    { path: '/data', label: 'données', icon: 'db' },
    { path: '/documents', label: 'documents', icon: 'book' },
    // memento masqué (2026-07-02) : on privilégie « documents » comme surface de
    // connaissance. Vue MementoView + endpoints /api/memento/* conservés en sommeil
    // (browse réactivable en réajoutant cette entrée + le master connector_activation).
  ]},
  // « manage account » (/account) et « activity » (/activity) ne sont PLUS dans la
  // sidebar : ils vivent dans le menu profil du pied (ConsoleUserMenu). Leurs routes
  // sont déclarées explicitement dans le routeur (elles ne dérivent plus de NAV).
  // ── Gérer mon org : agir SUR l'organisation active ─────────────────────────
  { group: 'organization', level: 'org', items: [
    { path: '/org/context', label: 'context', icon: 'bolt' },
    { path: '/org', label: 'members & secrets', icon: 'users' },
    { path: '/org/connectors', label: 'connectors', icon: 'plug' },
    { path: '/org/departments', label: 'departments', icon: 'users' },
  ]},
  // ── Gérer la plateforme : réservé opérateur plateforme ─────────────────────
  { group: 'platform · admin', level: 'platform', items: [
    { path: '/platform/context', label: 'context', icon: 'bolt' },
    { path: '/platform/monitoring', label: 'monitoring', icon: 'chart' },
    { path: '/platform/usage', label: 'usage & déroulés', icon: 'pulse' },
    { path: '/platform/users', label: 'users & grants', icon: 'shield' },
    { path: '/platform/access', label: 'alpha access', icon: 'shield' },
    { path: '/platform/orgs', label: 'orgs', icon: 'building' },
    { path: '/platform/objects', label: 'objects', icon: 'db' },
    { path: '/platform/connectors', label: 'connectors & keys', icon: 'plug' },
    { path: '/platform/instructions', label: 'server instructions', icon: 'doc' },
  ]},
]

// ── Helpers dérivés : à quel groupe / niveau appartient un path ─────────────
export function groupOfPath(path: string): NavGroup | undefined {
  return NAV.find((g) => g.items.some((it) => it.path === path))
}
export function levelOf(path: string): NavLevel {
  return groupOfPath(path)?.level ?? 'work'
}

export const PAGE_META: Record<string, { title: string; crumb: string }> = {
  '/overview': { title: 'overview', crumb: 'app.oto.ninja' },
  '/context': { title: 'ce que voit ton agent', crumb: 'mon espace' },
  '/connectors': { title: 'connectors', crumb: 'workspace' },
  '/procedures': { title: 'procédures', crumb: 'workspace' },
  '/data': { title: 'données', crumb: 'memory' },
  '/documents': { title: 'documents', crumb: 'memory' },
  '/account': { title: 'manage account', crumb: 'account' },
  '/activity': { title: 'activity', crumb: 'account' },
  '/org/context': { title: 'ce que voit l\'agent · org', crumb: 'gérer mon org' },
  '/org': { title: 'organization', crumb: 'gérer mon org' },
  '/org/connectors': { title: 'org connectors', crumb: 'gérer mon org' },
  '/org/departments': { title: 'departments', crumb: 'gérer mon org' },
  '/platform/context': { title: 'ce que voit l\'agent · plateforme', crumb: 'plateforme' },
  '/platform/monitoring': { title: 'mcp monitoring', crumb: 'plateforme' },
  '/platform/usage': { title: 'usage & déroulés', crumb: 'plateforme' },
  '/platform/users': { title: 'users & grants', crumb: 'plateforme' },
  '/platform/access': { title: 'alpha access', crumb: 'plateforme' },
  '/platform/orgs': { title: 'organizations', crumb: 'plateforme' },
  '/platform/objects': { title: 'owned objects', crumb: 'plateforme' },
  '/platform/connectors': { title: 'platform connectors', crumb: 'plateforme' },
  '/platform/instructions': { title: 'server instructions', crumb: 'plateforme' },
}
