// Navigation + ordre d'affichage des hits de recherche (lot 3 Ship 2) — partagés
// popup ⌘K / page /search. Le caller applique `scoped()` (préfixe /o/:org) + push.
import type { SearchHit } from '@/types/api'

export const FAMILIES: [SearchHit['kind'], string][] = [
  ['page', 'Pages'], ['brief', 'Projets'], ['tableau', 'Tableaux'],
  ['fichier', 'Fichiers'], ['procedure', 'Procédures'], ['guide', 'Guides'],
  ['connecteur', 'Connecteurs'],
]

export function groupHits(hits: SearchHit[]) {
  return FAMILIES
    .map(([kind, label]) => ({ kind, label, items: hits.filter((h) => h.kind === kind) }))
    .filter((g) => g.items.length)
}

// L'ordre À PLAT tel qu'affiché (groupé par famille) — la sélection ↑↓ le parcourt.
export function flattenHits(hits: SearchHit[]): SearchHit[] {
  return groupHits(hits).flatMap((g) => g.items)
}

export function hitPath(h: SearchHit): string {
  switch (h.kind) {
    case 'page': return `/projects/${h.project_id}?doc=${h.ref}`
    case 'brief': return `/projects/${h.ref}`
    case 'tableau': return `/data/${h.ref}`
    case 'fichier': return `/projects/${h.project_id}`
    case 'procedure': return `/procedures?doc=${h.ref}`
    case 'guide': return '/context'
    case 'connecteur': return `/connectors?tab=marketplace&connector=${h.ref}`
  }
}
