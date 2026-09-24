// Lecture d'une entrée du journal du datastore — mêmes conventions dans le panneau
// du tableau (DatastoreActivity) et dans l'historique d'une fiche (RowDrawer).
// Un seul rendu : « quand · d'où · qui · quoi ».
import type { RowActivityEntry, RowWriteSource } from '@/types/api'
import { cellShort } from './cellRender'
import { estEnveloppee, valeurDe, VIDE_ASSUME } from './rowCells'

/** Instant du geste, sous une forme que `Date.parse` lit SANS ambiguïté.
 *
 * Le backend sérialise ses `TIMESTAMPTZ` en heure NUE (`_normalize_value` :
 * `replace(tzinfo=None).isoformat(sep=' ')`) — le fuseau est retiré, pas converti,
 * donc le wire porte de l'UTC sans le dire. Or V8 interprète `"2026-07-28 16:05:09"`
 * (sans offset) comme de l'heure LOCALE : le geste qu'on vient de poser s'affiche
 * « 2 h » à Paris, et bascule en date absolue à l'ouest de Greenwich (`sec < 0`).
 * On rétablit donc l'offset avant toute lecture. Une valeur qui porte déjà son
 * fuseau (si le contrat backend se corrige) traverse intacte. */
export function whenOf(a: RowActivityEntry): string {
  const v = a.created_at
  if (!v) return ''
  return /[Zz]$|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v.replace(' ', 'T')}Z`
}

/** D'où vient le geste — la distinction qu'on doit lire d'un coup d'œil. Une clé de
 * `rowActivity.origin.*` (le composant traduit).
 *
 * `source` (journal des révisions, oto#273) fait foi quand elle est servie. Sans elle
 * (backend antérieur, ou geste qui n'a rien écrit) : `rest` = console, `mcp` = agent ;
 * une `revision` sans source est une écriture passée hors du serveur, d'origine
 * INCONNUE — la dire « agent » serait faux. Une source que ce front ne connaît pas
 * encore est rendue telle quelle (`originLabel`). */
export type Origin = RowWriteSource | 'unknown'
const SOURCES: readonly RowWriteSource[] = ['import', 'agent', 'console', 'api', 'upload', 'system']

export function originOf(a: RowActivityEntry): Origin | string {
  if (a.source) return a.source
  if (a.kind === 'rest') return 'console'
  if (a.kind === 'mcp') return 'agent'
  return 'unknown'
}

export const isKnownOrigin = (o: string): o is Origin =>
  o === 'unknown' || (SOURCES as readonly string[]).includes(o)

/** Le libellé du badge d'origine, traduit par `t` (celui du composant). */
export function originLabel(a: RowActivityEntry, t: (key: string) => string): string {
  const o = originOf(a)
  return isKnownOrigin(o) ? t(`rowActivity.origin.${o}`) : o
}

/** Accent du badge d'origine : un humain dans la console (cobalt), un agent (olive),
 * une donnée qui entre en masse (saffron : import, upload), la machine ou l'inconnu (ink). */
const TONS: Record<Origin, 'cobalt' | 'olive' | 'saffron' | 'ink'> = {
  console: 'cobalt', agent: 'olive', import: 'saffron', upload: 'saffron',
  api: 'ink', system: 'ink', unknown: 'ink',
}

export function originTone(a: RowActivityEntry): 'cobalt' | 'olive' | 'saffron' | 'ink' {
  const o = originOf(a)
  return isKnownOrigin(o) ? TONS[o] : 'ink'
}

/** Qui a posé le geste : le run nommé de l'agent s'il y en a un, sinon la personne. */
export function actorOf(a: RowActivityEntry): string {
  if (a.run_label) return `run « ${a.run_label} »`
  return a.email ?? a.sub ?? a.acteur ?? '—'
}

/** Ce que le geste a changé, en une expression : la transition d'état si c'en est
 * une, sinon les champs touchés. Vide = rien d'écrit (lecture), ou entrée
 * antérieure à l'élargissement du journal. */
export function changeOf(a: RowActivityEntry): string {
  if (a.from_status || a.to_status) return `${a.from_status ?? '—'} → ${a.to_status ?? '—'}`
  return a.fields?.length ? a.fields.join(', ') : ''
}

/** Une valeur de diff, prête à afficher. `marker` = un état qui se traduit (le
 * composant le rend) : `absent` (la colonne n'existait pas de ce côté), `null`,
 * `empty` (le vide assumé `@empty`). Sinon `text`, borné ; `full` = le texte entier
 * (infobulle) quand il a été coupé. Les couches `comment`/`link` suivent la valeur ;
 * `origine` n'est pas une écriture de ce geste et n'est pas rendue. */
export interface ShownValue {
  marker?: 'absent' | 'null' | 'empty'
  text?: string
  full?: string
  comment?: string
  link?: string
}

export interface ColumnChange { field: string; avant: ShownValue; apres: ShownValue }

const MAX_TEXTE = 60
const MAX_ELEMENTS = 3

const borne = (s: string): ShownValue =>
  s.length > MAX_TEXTE ? { text: s.slice(0, MAX_TEXTE - 1) + '…', full: s } : { text: s }

function texteDe(v: unknown): string {
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    const tete = v.slice(0, MAX_ELEMENTS).map((e) => texteDe(valeurDe(e)))
    return v.length > MAX_ELEMENTS ? `${tete.join(', ')} +${v.length - MAX_ELEMENTS}` : tete.join(', ')
  }
  if (v === VIDE_ASSUME) return VIDE_ASSUME
  if (v === null || v === undefined) return '∅'
  if (v === '') return '""'
  return cellShort(v)
}

export function shownValue(present: boolean, v: unknown): ShownValue {
  if (!present) return { marker: 'absent' }
  const valeur = valeurDe(v)
  const out: ShownValue = valeur === null || valeur === undefined ? { marker: 'null' }
    : valeur === VIDE_ASSUME ? { marker: 'empty' }
    : borne(texteDe(valeur))
  if (estEnveloppee(v)) {
    if (v.comment != null && v.comment !== '') out.comment = String(v.comment)
    if (v.link != null && v.link !== '') out.link = String(v.link)
  }
  return out
}

/** Ce que le geste a écrit, colonne par colonne, avec les valeurs — ou `null` si
 * l'entrée ne porte pas de `revisions` (backend antérieur, lecture, refus) : l'appelant
 * garde alors `changeOf`. Un geste qui a écrit plusieurs révisions se lit d'un bloc :
 * l'« avant » de sa plus ancienne, l'« après » de sa plus récente (`revisions` arrive
 * plus récente d'abord). Colonnes dans l'ordre alphabétique, stable. */
export function valueChangesOf(a: RowActivityEntry): ColumnChange[] | null {
  if (!a.revisions?.length) return null
  const cols = new Map<string, { avant?: [boolean, unknown]; apres?: [boolean, unknown] }>()
  for (const r of a.revisions) {              // plus récente → plus ancienne
    for (const [field, d] of Object.entries(r.diff ?? {})) {
      const c = cols.get(field) ?? {}
      c.apres ??= ['apres' in d, d.apres]     // la première vue est la plus récente
      c.avant = ['avant' in d, d.avant]        // la dernière vue est la plus ancienne
      cols.set(field, c)
    }
  }
  return [...cols.keys()].sort().map((field) => {
    const c = cols.get(field)!
    return { field, avant: shownValue(...c.avant!), apres: shownValue(...c.apres!) }
  })
}

/** Comment nommer la fiche visée : son titre si le tableau en déclare un, sinon
 * l'id abrégé (illisible mais identifiant), sinon rien. */
export function rowLabelOf(a: RowActivityEntry): string | null {
  if (a.row_title) return a.row_title
  return a.row_id ? a.row_id.slice(0, 8) : null
}
