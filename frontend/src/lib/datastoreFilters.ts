// Filtres par colonne de la vue tableau datastore (oto-dashboard#18). On DÉRIVE le
// type de filtre d'une colonne de ses valeurs (schéma libre, comme cellRender) et on
// expose les ops pertinentes par type. Le filtrage réel est server-side (cf.
// db._ds_filter_clauses) ; ici on ne fait que produire la liste `ColumnFilter[]`.
import { cellKind } from './cellRender'
import type { ColumnFilter, FilterOp } from '@/types/api'

export type FilterKind = 'text' | 'number' | 'date' | 'bool'

// État local d'un filtre de colonne (avant assemblage en ColumnFilter).
export interface ColFilterState { op: FilterOp; value: string }

/** Type de filtre d'une colonne, déduit de la 1re valeur non vide de la page. */
export function columnFilterKind(rows: Array<Record<string, unknown>>, field: string): FilterKind {
  for (const r of rows) {
    const k = cellKind(r[field])
    if (k === 'number') return 'number'
    if (k === 'date') return 'date'
    if (k === 'bool') return 'bool'
    if (k !== 'empty') return 'text'
  }
  return 'text'
}

export const OPS_BY_KIND: Record<FilterKind, FilterOp[]> = {
  text: ['contains', 'eq', 'ne', 'empty', 'not_empty'],
  number: ['eq', 'gte', 'lte', 'gt', 'lt', 'empty', 'not_empty'],
  date: ['gte', 'lte', 'eq', 'empty', 'not_empty'],
  bool: ['eq', 'ne', 'empty', 'not_empty'],
}

// Libellé d'op — contextualisé pour les dates (avant/après) vs ordres numériques.
export function opLabel(op: FilterOp, kind: FilterKind): string {
  if (kind === 'date') {
    if (op === 'gte') return 'à partir du'
    if (op === 'lte') return "jusqu'au"
    if (op === 'gt') return 'après'
    if (op === 'lt') return 'avant'
  }
  if (kind === 'bool') {
    if (op === 'eq') return 'est'
    if (op === 'ne') return "n'est pas"
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

/** Libellé compact d'un filtre appliqué (chip « champ op valeur »). */
export function filterChipLabel(f: ColumnFilter, kind: FilterKind = 'text'): string {
  const label = opLabel(f.op, kind)
  if (!opNeedsValue(f.op)) return `${f.field} ${label}`
  const v = Array.isArray(f.value) ? f.value.join(', ') : f.value
  if (kind === 'bool' && (v === 'true' || v === 'false'))
    return `${f.field} ${label} ${v === 'true' ? 'vrai' : 'faux'}`
  return `${f.field} ${label} ${v}`
}

// ── (dé)sérialisation URL (?f=) — deep-link de l'état filtré du tableau ────────
const ALL_OPS = new Set<string>([...Object.values(OPS_BY_KIND).flat(), 'in'])

/** Sérialise les filtres pour le param d'URL `?f=` (triplets compacts). */
export function filtersToParam(filters: ColumnFilter[]): string {
  return filters.length ? JSON.stringify(filters.map((f) => [f.field, f.op, f.value])) : ''
}

/** Relit `?f=` en `ColumnFilter[]`. Un param d'URL est une saisie utilisateur :
 * les entrées malformées sont IGNORÉES (pas d'erreur — l'URL reste éditable à
 * la main), seuls les triplets valides (op whitelistée) sont conservés. */
export function filtersFromParam(raw: string | null | undefined): ColumnFilter[] {
  if (!raw) return []
  let arr: unknown
  try { arr = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const out: ColumnFilter[] = []
  for (const t of arr) {
    if (!Array.isArray(t) || typeof t[0] !== 'string' || !t[0]) continue
    const op = t[1] as FilterOp
    if (typeof op !== 'string' || !ALL_OPS.has(op)) continue
    const value = Array.isArray(t[2]) ? t[2].map(String) : String(t[2] ?? '')
    if (opNeedsValue(op) && !(Array.isArray(value) ? value.length : value)) continue
    out.push({ field: t[0], op, value })
  }
  return out
}
