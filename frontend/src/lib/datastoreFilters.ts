// Filtres par colonne de la vue tableau datastore (oto-dashboard#18). On DÉRIVE le
// type de filtre d'une colonne de ses valeurs (schéma libre, comme cellRender) et on
// expose les ops pertinentes par type. Le filtrage réel est server-side (cf.
// db._ds_filter_clauses) ; ici on ne fait que produire la liste `ColumnFilter[]`.
import { cellKind } from './cellRender'
import type { ColumnFilter, FilterOp } from '@/types/api'

export type FilterKind = 'text' | 'number' | 'date'

// État local d'un filtre de colonne (avant assemblage en ColumnFilter).
export interface ColFilterState { op: FilterOp; value: string }

/** Type de filtre d'une colonne, déduit de la 1re valeur non vide de la page. */
export function columnFilterKind(rows: Array<Record<string, unknown>>, field: string): FilterKind {
  for (const r of rows) {
    const k = cellKind(r[field])
    if (k === 'number') return 'number'
    if (k === 'date') return 'date'
    if (k !== 'empty') return 'text'
  }
  return 'text'
}

export const OPS_BY_KIND: Record<FilterKind, FilterOp[]> = {
  text: ['contains', 'eq', 'ne', 'empty', 'not_empty'],
  number: ['eq', 'gte', 'lte', 'gt', 'lt', 'empty', 'not_empty'],
  date: ['gte', 'lte', 'eq', 'empty', 'not_empty'],
}

// Libellé d'op — contextualisé pour les dates (avant/après) vs ordres numériques.
export function opLabel(op: FilterOp, kind: FilterKind): string {
  if (kind === 'date') {
    if (op === 'gte') return 'à partir du'
    if (op === 'lte') return "jusqu'au"
    if (op === 'gt') return 'après'
    if (op === 'lt') return 'avant'
  }
  return {
    contains: 'contient', eq: '=', ne: '≠', in: 'parmi',
    gt: '>', gte: '≥', lt: '<', lte: '≤',
    empty: 'vide', not_empty: 'rempli',
  }[op]
}

export function defaultOp(kind: FilterKind): FilterOp { return OPS_BY_KIND[kind][0] ?? 'contains' }

/** Un op « vide / rempli » n'attend pas de valeur saisie. */
export function opNeedsValue(op: FilterOp): boolean { return op !== 'empty' && op !== 'not_empty' }

/** Assemble l'état local par champ en `ColumnFilter[]` propre (vire les vides). */
export function buildFilters(state: Record<string, ColFilterState>): ColumnFilter[] {
  const out: ColumnFilter[] = []
  for (const [field, f] of Object.entries(state)) {
    if (!f || !f.op) continue
    if (!opNeedsValue(f.op)) { out.push({ field, op: f.op, value: '' }); continue }
    const v = f.value?.trim()
    if (v) out.push({ field, op: f.op, value: v })
  }
  return out
}
