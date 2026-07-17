// Modèle du NAVIGATEUR de contenu d'un projet (refonte UX Projet, ADR 0032) : le rail
// d'entités (droite) et le viewer polymorphe (gauche) partagent une même sélection `sel`
// (clé stable) et une même description d'item. Construit par ProjectDetailView à partir
// des docs (pages), des `project.links` (tableau/connecteur/procédure/doc) et des fichiers.
import type { Doc, ProjectFile, ProjectLink } from '@/types/api'

// Le viewer sait rendre 6 formes. `page` couvre l'accueil (brief) ET une page Documents.
export type RailKind = 'page' | 'tableau' | 'connecteur' | 'procedure' | 'doc' | 'file'

export interface RailItem {
  key: string                 // clé de sélection stable (ex. `home`, `doc:12`, `link:connecteur:sirene|`, `file:3`)
  kind: RailKind
  label: string
  home?: boolean              // page d'accueil (brief) — icône maison
  parentKey?: string | null   // sous-page : clé du parent (indentation + repli)
  pad?: number                // niveau d'indentation (0/1) pour le rail
  railTag?: { tone: 'saffron' | 'terra' | 'cobalt' | 'olive'; label: string } | null
  hint?: string | null        // chapô (Ship 2) — tooltip du rail, jamais une 2e ligne
  doc?: Doc                   // kind=page (≠ accueil)
  link?: ProjectLink          // kind=tableau|connecteur|procedure|doc
  file?: ProjectFile          // kind=file
  derived?: string[]          // connecteur REQUIS par une procédure mais non déclaré (sources : 'procedure:<slug>' | 'run')
}

export interface RailGroup {
  key: string
  label: string
  icon: string
  kind: RailKind | 'page'
  addKind: 'connecteur' | 'tableau' | 'procedure' | 'page' | 'file'
  items: RailItem[]
}
