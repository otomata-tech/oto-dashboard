// Les refus d'une écriture de ligne que l'éditeur sait TRAITER (oto#213), lus dans
// l'enveloppe REST `{error, detail, details?}`. Tout autre échec n'en est pas un : il
// s'affiche tel que le serveur l'a écrit (`explain`), sans prétendre savoir quoi en faire.
//
//   409 `revision_conflict` — la ligne a changé depuis la lecture ; `details.current_revision`.
//                             ⚠️ La révision bouge AUSSI avec le bail : le conflit peut
//                             arriver à données identiques. L'écran relit et compare.
//   409 `row_locked`        — la ligne est réservée par un autre ; rien n'est écrit.
//   400 `row_invalid`       — refus du schéma ; `details.expected_column` nomme la colonne, et
//                             `details.a_renvoyer` (+ `a_renvoyer_elements`) désigne le CHAMP
//                             fautif, jusque dans un élément de liste (oto#135, lu ici pour
//                             oto#219). Jamais la phrase : elle n'est pas analysée.
import { ApiError } from '@/api'

/** Un champ fautif désigné par le serveur : la colonne, l'élément de liste (par son rang, ou
 * par son identité `[clé, valeur]` quand la liste en déclare une), le sous-champ, et le
 * gabarit attendu (`<email>`, `<nombre>`…). `champ` nul = la colonne ou l'élément entier. */
export interface FauteDeChamp {
  colonne: string
  element: number | null
  identite: [string, string] | null
  champ: string | null
  attendu: string | null
}

export type RefusDeLigne =
  | { sorte: 'conflit'; revisionActuelle: string | null }
  | { sorte: 'reservee'; detail: string | null }
  | { sorte: 'invalide'; colonne: string | null; chemin: string | null; detail: string | null; fautes: FauteDeChamp[] }

const gabarit = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Les champs fautifs, lus dans la charge à renvoyer : un fragment de ligne qui ne porte QUE
 * ce qu'il faut corriger. Une liste n'y garde que ses éléments en cause, dans l'ordre de leur
 * rang, et `a_renvoyer_elements` les désigne (`contacts[0]` ou `contacts[email=x@y.fr]`). */
export function fautesDe(details: Record<string, unknown> | undefined): FauteDeChamp[] {
  const frag = details?.a_renvoyer
  if (!frag || typeof frag !== 'object' || Array.isArray(frag)) return []
  const designations = Array.isArray(details?.a_renvoyer_elements)
    ? (details!.a_renvoyer_elements as unknown[]).filter((d): d is string => typeof d === 'string') : []
  const out: FauteDeChamp[] = []
  for (const [colonne, v] of Object.entries(frag as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      const siennes = designations.filter((d) => d.startsWith(`${colonne}[`))
      v.forEach((item, i) => {
        const d = siennes[i] ?? ''
        const parRang = /\[(\d+)\]$/.exec(d)
        const parIdentite = /\[([^=\]]+)=([^\]]*)\]$/.exec(d)
        const element = parRang ? Number(parRang[1]) : null
        const identite: [string, string] | null = parIdentite ? [parIdentite[1]!, parIdentite[2]!] : null
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          for (const [champ, g] of Object.entries(item as Record<string, unknown>)) {
            if (identite && champ === identite[0]) continue   // l'identité désigne, elle n'est pas fautive
            out.push({ colonne, element, identite, champ, attendu: gabarit(g) })
          }
        } else out.push({ colonne, element, identite, champ: null, attendu: gabarit(item) })
      })
    } else if (v && typeof v === 'object') {
      for (const [champ, g] of Object.entries(v as Record<string, unknown>))
        out.push({ colonne, element: null, identite: null, champ, attendu: gabarit(g) })
    } else out.push({ colonne, element: null, identite: null, champ: null, attendu: gabarit(v) })
  }
  return out
}

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
    const fautes = fautesDe(e.details)
    const chemin = typeof c === 'string' && c ? c : null
    const colonne = chemin ? colonneDuChemin(chemin) : (fautes[0]?.colonne ?? null)
    return { sorte: 'invalide', chemin, colonne, detail, fautes }
  }
  return null
}
