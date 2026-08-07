// Filtres par colonne de la vue tableau datastore (oto-dashboard#18). On DÉRIVE le
// type de filtre d'une colonne de ses valeurs (schéma libre, comme cellRender) et on
// expose les ops pertinentes par type. Le filtrage réel est server-side (cf.
// db._ds_filter_clauses) ; ici on ne fait que produire la liste `ColumnFilter[]`.
import { cellKind } from './cellRender'
import type { ColumnFilter, FilterOp } from '@/types/api'

export type FilterKind = 'text' | 'number' | 'date' | 'bool' | 'timestamp'

// État local d'un filtre de colonne (avant assemblage en ColumnFilter).
export interface ColFilterState { op: FilterOp; value: string }

// Colonnes MÉTA (dates système posées par le serveur, hors `data`). Elles se
// trient ET se filtrent (cf. db._DS_META_TS_COLS) — `kind='timestamp'` parce
// qu'elles sont TOUJOURS renseignées : « vide / rempli » n'y a pas de sens, et le
// backend refuse ces ops. Ordre = celui d'affichage en bout de table.
export const META_DATE_FIELDS = ['_updated_at', '_created_at'] as const
const META_LABELS: Record<string, string> = {
  _updated_at: 'modifié le',
  _created_at: 'créé le',
}

/** Libellé affichable d'une colonne méta (sinon le nom brut). */
export function metaFieldLabel(field: string): string {
  return META_LABELS[field] ?? field
}

export function isMetaDateField(field: string): boolean {
  return (META_DATE_FIELDS as readonly string[]).includes(field)
}

// Type DÉCLARÉ au schéma (ADR 0046) → type de filtre. Il fait autorité sur la
// détection par la valeur : une colonne vide sur la page courante n'a plus à
// retomber en `text` (et à perdre ses ops d'ordre) alors que le schéma la dit
// `number`. Les types composites n'ont pas de filtre propre → texte.
const KIND_BY_DECLARED_TYPE: Record<string, FilterKind> = {
  number: 'number', date: 'date', datetime: 'date', bool: 'bool',
  text: 'text', url: 'text', email: 'text', enum: 'text',
}

/** Type de filtre d'une colonne : type déclaré au schéma s'il existe, sinon déduit
 * de la 1re valeur non vide de la page. */
export function columnFilterKind(rows: Array<Record<string, unknown>>, field: string,
                                 declaredType?: string | null): FilterKind {
  // Les dates système ne se devinent pas des valeurs : une page vide (ou filtrée à
  // zéro) rendrait `text`, donc un filtre de date impossible à saisir là où il est
  // justement le plus utile.
  if (isMetaDateField(field)) return 'timestamp'
  if (declaredType && KIND_BY_DECLARED_TYPE[declaredType]) return KIND_BY_DECLARED_TYPE[declaredType]
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
  // Miroir de db._DS_META_TS_OPS : pas d'`empty`/`not_empty` sur une colonne
  // NOT NULL (le backend les refuse — ne pas proposer un choix qui rend 400).
  timestamp: ['gte', 'lte', 'eq', 'gt', 'lt'],
}

// Libellé d'op — contextualisé pour les dates (avant/après) vs ordres numériques.
export function opLabel(op: FilterOp, kind: FilterKind): string {
  if (kind === 'date' || kind === 'timestamp') {
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

/** Libellé compact d'un filtre appliqué (chip « champ op valeur »). `field` permet
 * de nommer la colonne comme l'en-tête le fait (libellé de schéma, date système),
 * plutôt que par sa clé technique. */
export function filterChipLabel(f: ColumnFilter, kind: FilterKind = 'text',
                                field: string = metaFieldLabel(f.field)): string {
  const label = opLabel(f.op, kind)
  if (!opNeedsValue(f.op)) return `${field} ${label}`
  const v = Array.isArray(f.value) ? f.value.join(', ') : f.value
  if (kind === 'bool' && (v === 'true' || v === 'false'))
    return `${field} ${label} ${v === 'true' ? 'vrai' : 'faux'}`
  return `${field} ${label} ${v}`
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
