// Navigation de la console : groupes sidebar + métadonnées de page (titre/crumb).
// `id` = segment de route sous /console/<id>.

export interface NavItem {
  id: string
  label: string
  icon: string
  warn?: boolean
  count?: string
}

export interface NavGroup {
  group: string | null
  admin?: boolean
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  { group: null, items: [
    { id: 'overview', label: 'overview', icon: 'home' },
  ]},
  { group: 'workspace', items: [
    { id: 'connectors', label: 'connectors', icon: 'plug' },
    { id: 'toolbox', label: 'toolbox', icon: 'wrench' },
    { id: 'doctrine', label: 'doctrine', icon: 'doc' },
    { id: 'data', label: 'data', icon: 'db' },
  ]},
  { group: 'prospection', items: [
    { id: 'scout', label: 'cockpit', icon: 'phone' },
  ]},
  { group: 'account', items: [
    { id: 'activity', label: 'activity', icon: 'pulse' },
    { id: 'org', label: 'organization', icon: 'users' },
    { id: 'groups', label: 'departments', icon: 'users' },
  ]},
  { group: 'platform · admin', admin: true, items: [
    { id: 'monitoring', label: 'monitoring', icon: 'chart' },
    { id: 'adminusers', label: 'users & grants', icon: 'shield' },
    { id: 'adminaccess', label: 'alpha access', icon: 'shield' },
    { id: 'adminorgs', label: 'orgs', icon: 'building' },
    { id: 'platformkeys', label: 'platform keys', icon: 'key' },
    { id: 'adminconnectors', label: 'connector activation', icon: 'plug' },
  ]},
]

export const PAGE_META: Record<string, { title: string; crumb: string }> = {
  overview: { title: 'overview', crumb: 'app.oto.ninja' },
  connectors: { title: 'connectors', crumb: 'workspace' },
  toolbox: { title: 'toolbox', crumb: 'workspace' },
  doctrine: { title: 'doctrine', crumb: 'workspace' },
  data: { title: 'data', crumb: 'workspace' },
  scout: { title: 'cockpit', crumb: 'prospection' },
  activity: { title: 'activity', crumb: 'account' },
  org: { title: 'organization', crumb: 'account' },
  groups: { title: 'departments', crumb: 'account' },
  monitoring: { title: 'mcp monitoring', crumb: 'platform' },
  adminusers: { title: 'users & grants', crumb: 'platform' },
  adminaccess: { title: 'alpha access', crumb: 'platform' },
  adminorgs: { title: 'organizations', crumb: 'platform' },
  platformkeys: { title: 'platform keys', crumb: 'platform' },
  adminconnectors: { title: 'connector activation', crumb: 'platform' },
}
