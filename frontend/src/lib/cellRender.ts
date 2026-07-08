// Rendu typé des valeurs du datastore (schéma libre) : on DÉRIVE le type d'affichage
// de la valeur elle-même (et du nom de champ pour les dates), sans config par
// namespace. Sert DataTable (cellule compacte) et RowDrawer (détail).

export type CellKind = 'empty' | 'date' | 'url' | 'number' | 'bool' | 'json' | 'longtext' | 'text'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/
const LONGTEXT_MIN = 80

export function cellKind(value: unknown): CellKind {
  if (value === null || value === undefined || value === '') return 'empty'
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'object') return 'json'
  const s = String(value)
  if (ISO_DATE_RE.test(s)) return 'date'
  if (/^https?:\/\/\S+$/i.test(s)) return 'url'
  if (s.length > LONGTEXT_MIN) return 'longtext'
  return 'text'
}

/** Valeur compacte pour une cellule de table (1 ligne). */
export function cellShort(value: unknown, kind: CellKind = cellKind(value)): string {
  switch (kind) {
    case 'empty': return ''
    case 'bool': return value ? 'true' : 'false'
    case 'number': return String(value)
    case 'json': return jsonPreview(value)
    case 'date': return absDate(String(value))
    default: return String(value)
  }
}

/** Aperçu 1-ligne d'une valeur imbriquée (schéma v2 : sous-record / liste) —
 * `n × {1er item}` pour une liste, JSON compact tronqué pour un objet. */
function jsonPreview(value: unknown, limit = 60): string {
  let s: string
  try {
    if (Array.isArray(value)) {
      const head = value.length ? JSON.stringify(value[0]) : ''
      s = head ? `${value.length} × ${head}` : '0 item'
    } else s = JSON.stringify(value)
  } catch { s = String(value) }
  return s.length > limit ? s.slice(0, limit - 1) + '…' : s
}

/** Date absolue lisible « 2026-06-22 09:07 » (tronquée à la minute). */
export function absDate(v: string): string {
  return v.replace('T', ' ').slice(0, 16)
}

/** Date relative « 3 h », « 2 j », « à l'instant » — best-effort, vide si non parsable.
 * `nowMs` injectable pour les tests (sinon Date.now()). */
export function relDate(v: unknown, nowMs: number = Date.now()): string {
  if (!v) return ''
  const t = Date.parse(String(v))
  if (Number.isNaN(t)) return ''
  const sec = Math.round((nowMs - t) / 1000)
  if (sec < 0) return absDate(String(v))
  if (sec < 60) return "à l'instant"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} j`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} mois`
  return `${Math.floor(mo / 12)} an${Math.floor(mo / 12) > 1 ? 's' : ''}`
}

/** Valeur de tri comparable : nombres et dates triés correctement, le reste en string. */
export function sortValue(value: unknown): number | string {
  const k = cellKind(value)
  if (k === 'number') return value as number
  if (k === 'date') { const t = Date.parse(String(value)); return Number.isNaN(t) ? String(value) : t }
  if (k === 'empty') return ''
  if (k === 'bool') return value ? 1 : 0
  if (k === 'json') return JSON.stringify(value)
  return String(value).toLowerCase()
}
