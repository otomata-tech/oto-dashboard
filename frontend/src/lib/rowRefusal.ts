// Les refus d'une écriture de ligne que l'éditeur sait TRAITER (oto#213), lus dans
// l'enveloppe REST `{error, detail, details?}`. Tout autre échec n'en est pas un : il
// s'affiche tel que le serveur l'a écrit (`explain`), sans prétendre savoir quoi en faire.
//
//   409 `revision_conflict` — la ligne a changé depuis la lecture ; `details.current_revision`.
//                             ⚠️ La révision bouge AUSSI avec le bail : le conflit peut
//                             arriver à données identiques. L'écran relit et compare.
//   409 `row_locked`        — la ligne est réservée par un autre ; rien n'est écrit.
//   400 `row_invalid`       — refus du schéma ; `details.expected_column` nomme la colonne.
import { ApiError } from '@/api'

export type RefusDeLigne =
  | { sorte: 'conflit'; revisionActuelle: string | null }
  | { sorte: 'reservee'; detail: string | null }
  | { sorte: 'invalide'; colonne: string | null; chemin: string | null; detail: string | null }

/** La colonne d'un chemin. ⚠️ La forme d'un chemin d'ÉLÉMENT de liste n'est pas encore
 * servie : `contacts[1].fonction` et `contacts.1.fonction` donnent tous deux `contacts`. */
export const colonneDuChemin = (chemin: string): string => chemin.split(/[.[]/, 1)[0] || chemin

export function refusDeLigne(e: unknown): RefusDeLigne | null {
  if (!(e instanceof ApiError)) return null
  const detail = e.detail?.trim() || null
  if (e.status === 409 && e.code === 'revision_conflict') {
    const r = e.details?.current_revision
    return { sorte: 'conflit', revisionActuelle: r == null ? null : String(r) }
  }
  if (e.status === 409 && e.code === 'row_locked') return { sorte: 'reservee', detail }
  if (e.status === 400 && e.code === 'row_invalid') {
    const c = e.details?.expected_column
    const chemin = typeof c === 'string' && c ? c : null
    return { sorte: 'invalide', chemin, colonne: chemin && colonneDuChemin(chemin), detail }
  }
  return null
}
