// Navigation de la console : deux registres + métadonnées de page (titre/crumb).
//
// L'IA est organisée par NIVEAU D'AUTORITÉ, pas seulement par fonction :
//   • registre 'work' (« mon espace ») = surfaces de consommation, toujours au
//     niveau de l'utilisateur (ma config effective, mes données, mon usage).
//   • registre 'gov' (« gouvernance ») = surfaces qui AGISSENT SUR une org ou la
//     plateforme entière, sous-découpées par `scope` ('org' | 'platform').
//
// `id` = segment de route sous /console/<id> (les routes restent plates ; seul
// l'affichage sidebar/topbar dépend du registre/scope actif).

export type Registre = 'work' | 'gov'
export type GovScope = 'org' | 'platform'

export interface NavItem {
  id: string
  label: string
  icon: string
  warn?: boolean
  count?: string
  super?: boolean // visible au super_admin seul (action plateforme sensible)
}

export interface NavGroup {
  group: string | null
  registre: Registre
  scope?: GovScope // gouvernance uniquement
  admin?: boolean // section gatée : visible à l'opérateur plateforme (admin) ET au super_admin
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  // ── Mon espace : consommation, niveau utilisateur ──────────────────────────
  { group: null, registre: 'work', items: [
    { id: 'overview', label: 'overview', icon: 'home' },
  ]},
  { group: 'workspace', registre: 'work', items: [
    { id: 'connectors', label: 'connectors', icon: 'plug' },
    { id: 'toolbox', label: 'toolbox', icon: 'wrench' },
    { id: 'doctrine', label: 'doctrine', icon: 'doc' },
  ]},
  { group: 'memory', registre: 'work', items: [
    { id: 'data', label: 'datastore', icon: 'db' },
    { id: 'knowledge', label: 'knowledge', icon: 'book' },
  ]},
  { group: 'prospection', registre: 'work', items: [
    { id: 'scout', label: 'cockpit', icon: 'phone' },
  ]},
  { group: 'account', registre: 'work', items: [
    { id: 'account', label: 'profile', icon: 'user' },
    { id: 'activity', label: 'activity', icon: 'pulse' },
    { id: 'billing', label: 'billing & credits', icon: 'card' },
  ]},
  // ── Gouvernance : agir SUR une org / la plateforme ─────────────────────────
  { group: 'organization', registre: 'gov', scope: 'org', items: [
    { id: 'org', label: 'members & secrets', icon: 'users' },
    { id: 'groups', label: 'departments', icon: 'users' },
  ]},
  { group: 'platform · admin', registre: 'gov', scope: 'platform', admin: true, items: [
    { id: 'monitoring', label: 'monitoring', icon: 'chart' },
    { id: 'usage', label: 'usage & déroulés', icon: 'pulse' },
    { id: 'adminusers', label: 'users & grants', icon: 'shield' },
    { id: 'adminaccess', label: 'alpha access', icon: 'shield' },
    { id: 'adminorgs', label: 'orgs', icon: 'building' },
    { id: 'platformkeys', label: 'platform keys', icon: 'key', super: true },
    { id: 'adminconnectors', label: 'connector activation', icon: 'plug' },
  ]},
]

// ── Helpers dérivés : à quel registre / scope appartient une section ─────────
export function groupOf(section: string): NavGroup | undefined {
  return NAV.find((g) => g.items.some((it) => it.id === section))
}
export function registreOf(section: string): Registre {
  return groupOf(section)?.registre ?? 'work'
}
export function scopeOf(section: string): GovScope | undefined {
  return groupOf(section)?.scope
}
// Première section atteignable d'un registre (et scope, en gouvernance).
export function firstSection(registre: Registre, scope?: GovScope): string {
  const g = NAV.find((x) => x.registre === registre && (scope ? x.scope === scope : true))
  return g?.items[0]?.id ?? 'overview'
}

export const PAGE_META: Record<string, { title: string; crumb: string }> = {
  overview: { title: 'overview', crumb: 'app.oto.ninja' },
  connectors: { title: 'connectors', crumb: 'workspace' },
  toolbox: { title: 'toolbox', crumb: 'workspace' },
  doctrine: { title: 'doctrine', crumb: 'workspace' },
  data: { title: 'datastore', crumb: 'memory' },
  knowledge: { title: 'knowledge', crumb: 'memory' },
  scout: { title: 'cockpit', crumb: 'prospection' },
  account: { title: 'profile', crumb: 'account' },
  activity: { title: 'activity', crumb: 'account' },
  billing: { title: 'billing & credits', crumb: 'account' },
  org: { title: 'organization', crumb: 'governance · org' },
  groups: { title: 'departments', crumb: 'governance · org' },
  monitoring: { title: 'mcp monitoring', crumb: 'governance · platform' },
  usage: { title: 'usage & déroulés', crumb: 'governance · platform' },
  adminusers: { title: 'users & grants', crumb: 'governance · platform' },
  adminaccess: { title: 'alpha access', crumb: 'governance · platform' },
  adminorgs: { title: 'organizations', crumb: 'governance · platform' },
  platformkeys: { title: 'platform keys', crumb: 'governance · platform' },
  adminconnectors: { title: 'connector activation', crumb: 'governance · platform' },
}
