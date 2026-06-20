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
  ]},
  { group: 'workspace', level: 'work', items: [
    { path: '/connectors', label: 'connectors', icon: 'plug' },
    { path: '/doctrine', label: 'doctrine', icon: 'doc' },
  ]},
  { group: 'library', level: 'work', items: [
    { path: '/library/connectors', label: 'connector library', icon: 'plug' },
    { path: '/library/doctrines', label: 'doctrine library', icon: 'book' },
  ]},
  { group: 'memory', level: 'work', items: [
    { path: '/data', label: 'datastore', icon: 'db' },
    { path: '/knowledge', label: 'knowledge', icon: 'book' },
  ]},
  { group: 'prospection', level: 'work', items: [
    { path: '/scout', label: 'cockpit', icon: 'phone' },
  ]},
  { group: 'account', level: 'work', items: [
    { path: '/account', label: 'profile', icon: 'user' },
    { path: '/activity', label: 'activity', icon: 'pulse' },
    { path: '/billing', label: 'billing & credits', icon: 'card' },
  ]},
  // ── Gérer mon org : agir SUR l'organisation active ─────────────────────────
  { group: 'organization', level: 'org', items: [
    { path: '/org', label: 'members & secrets', icon: 'users' },
    { path: '/org/departments', label: 'departments', icon: 'users' },
    { path: '/org/redaction', label: 'field redaction', icon: 'shield' },
  ]},
  // ── Gérer la plateforme : réservé opérateur plateforme ─────────────────────
  { group: 'platform · admin', level: 'platform', items: [
    { path: '/platform/monitoring', label: 'monitoring', icon: 'chart' },
    { path: '/platform/usage', label: 'usage & déroulés', icon: 'pulse' },
    { path: '/platform/users', label: 'users & grants', icon: 'shield' },
    { path: '/platform/access', label: 'alpha access', icon: 'shield' },
    { path: '/platform/orgs', label: 'orgs', icon: 'building' },
    { path: '/platform/keys', label: 'platform keys', icon: 'key', super: true },
    { path: '/platform/connectors', label: 'connector activation', icon: 'plug' },
  ]},
]

// ── Helpers dérivés : à quel groupe / niveau appartient un path ─────────────
export function groupOfPath(path: string): NavGroup | undefined {
  return NAV.find((g) => g.items.some((it) => it.path === path))
}
export function levelOf(path: string): NavLevel {
  return groupOfPath(path)?.level ?? 'work'
}
// Première section atteignable d'un niveau (cible du switch de niveau).
export function firstPath(level: NavLevel): string {
  const g = NAV.find((x) => x.level === level)
  return g?.items[0]?.path ?? '/overview'
}

export const PAGE_META: Record<string, { title: string; crumb: string }> = {
  '/overview': { title: 'overview', crumb: 'app.oto.ninja' },
  '/connectors': { title: 'connectors', crumb: 'workspace' },
  '/doctrine': { title: 'doctrine', crumb: 'workspace' },
  '/library/connectors': { title: 'connector library', crumb: 'library' },
  '/library/doctrines': { title: 'doctrine library', crumb: 'library' },
  '/data': { title: 'datastore', crumb: 'memory' },
  '/knowledge': { title: 'knowledge', crumb: 'memory' },
  '/scout': { title: 'cockpit', crumb: 'prospection' },
  '/account': { title: 'profile', crumb: 'account' },
  '/activity': { title: 'activity', crumb: 'account' },
  '/billing': { title: 'billing & credits', crumb: 'account' },
  '/org': { title: 'organization', crumb: 'gérer mon org' },
  '/org/departments': { title: 'departments', crumb: 'gérer mon org' },
  '/org/redaction': { title: 'field redaction', crumb: 'gérer mon org' },
  '/platform/monitoring': { title: 'mcp monitoring', crumb: 'plateforme' },
  '/platform/usage': { title: 'usage & déroulés', crumb: 'plateforme' },
  '/platform/users': { title: 'users & grants', crumb: 'plateforme' },
  '/platform/access': { title: 'alpha access', crumb: 'plateforme' },
  '/platform/orgs': { title: 'organizations', crumb: 'plateforme' },
  '/platform/keys': { title: 'platform keys', crumb: 'plateforme' },
  '/platform/connectors': { title: 'connector activation', crumb: 'plateforme' },
}
