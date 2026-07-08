// Rôle d'un partage de ressource possédée (ADR 0048) — un seul vocabulaire, deux
// dialogues (SharePrincipalDialog · ProjectShareDialog). Le backend porte le RÔLE
// (viewer/editor/manager) ; `permission` (read/write) reste en repli rétro-compat.
export type ResourceRole = 'viewer' | 'editor' | 'manager'

// Ordre = défaut du sélecteur (éditeur d'abord — le partage courant).
export const ROLE_OPTIONS: { value: ResourceRole; label: string }[] = [
  { value: 'editor', label: 'éditeur' },
  { value: 'viewer', label: 'lecteur' },
  { value: 'manager', label: 'gérant' },
]

const LABELS: Record<ResourceRole, string> = {
  viewer: 'lecteur', editor: 'éditeur', manager: 'gérant',
}
// Un axe = une couleur (cf. ConnectorBadges) : lecteur cobalt, éditeur olive, gérant saffron.
const TONES: Record<ResourceRole, 'cobalt' | 'olive' | 'saffron'> = {
  viewer: 'cobalt', editor: 'olive', manager: 'saffron',
}

// Rôle effectif : `role` prime ; à défaut on mappe l'ancienne `permission` (read→lecteur,
// write→éditeur) — jamais gérant en repli (la gouvernance est un grant explicite).
export function normalizeRole(role?: string | null, permission?: string | null): ResourceRole {
  if (role === 'viewer' || role === 'editor' || role === 'manager') return role
  return permission === 'read' ? 'viewer' : 'editor'
}

export const roleLabel = (role?: string | null, permission?: string | null): string =>
  LABELS[normalizeRole(role, permission)]

export const roleTone = (role?: string | null, permission?: string | null) =>
  TONES[normalizeRole(role, permission)]
