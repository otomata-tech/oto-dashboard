// Lecture d'une entrée du journal du datastore — mêmes conventions dans le panneau
// du tableau (DatastoreActivity) et dans l'historique d'une fiche (RowDrawer).
// Un seul rendu : « quand · d'où · qui · quoi ».
import type { RowActivityEntry } from '@/types/api'

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

/** D'où vient le geste — la distinction qu'on doit lire d'un coup d'œil. */
export function originLabel(a: RowActivityEntry): string {
  return a.kind === 'rest' ? 'console' : 'agent'
}

/** Accent du badge d'origine : humain (cobalt) vs agent (olive). */
export function originTone(a: RowActivityEntry): 'cobalt' | 'olive' {
  return a.kind === 'rest' ? 'cobalt' : 'olive'
}

/** Qui a posé le geste : le run nommé de l'agent s'il y en a un, sinon la personne. */
export function actorOf(a: RowActivityEntry): string {
  if (a.run_label) return `run « ${a.run_label} »`
  return a.email ?? a.sub ?? '—'
}

/** Ce que le geste a changé, en une expression : la transition d'état si c'en est
 * une, sinon les champs touchés. Vide = rien d'écrit (lecture), ou entrée
 * antérieure à l'élargissement du journal. */
export function changeOf(a: RowActivityEntry): string {
  if (a.from_status || a.to_status) return `${a.from_status ?? '—'} → ${a.to_status ?? '—'}`
  return a.fields?.length ? a.fields.join(', ') : ''
}

/** Comment nommer la fiche visée : son titre si le tableau en déclare un, sinon
 * l'id abrégé (illisible mais identifiant), sinon rien. */
export function rowLabelOf(a: RowActivityEntry): string | null {
  if (a.row_title) return a.row_title
  return a.row_id ? a.row_id.slice(0, 8) : null
}
