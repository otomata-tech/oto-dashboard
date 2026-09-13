// Ce qu'une ADRESSE désigne dans une liste chargée, et ce que l'écran dit quand elle n'ouvre
// pas l'objet demandé (oto#201, oto#203).
//
// Le défaut commun : un paramètre d'URL résolu contre une liste retombait EN SILENCE sur un
// autre objet — la première procédure (oto#201) ; le brief du projet, le tableau précédent,
// le premier de deux tableaux homonymes (oto#203). La règle, pour chaque écran qui résout :
//  - les clés se testent DANS L'ORDRE, l'identifiant d'abord : un id ne désigne qu'un objet,
//    un nom peut en désigner plusieurs, et chercher les deux dans la même passe laissait
//    l'ordre de la liste trancher ;
//  - une clé qui trouve PLUSIEURS objets ne choisit pas : l'écran liste les candidats ;
//  - rien trouvé : l'écran le dit (`TargetRefusalCard`), et rien ne s'affiche à la place.
import { ApiError } from '@/api'
import { humanize } from '@/lib/errors'

export type Resolution<T> =
  | { kind: 'found'; item: T }
  | { kind: 'ambiguous'; candidates: T[] }
  | { kind: 'unknown' }

/** Une clé de désignation : ce qu'une adresse peut porter pour un objet (`null` = aucune). */
export type TargetKey<T> = (item: T) => string | number | null | undefined

export function resolveTarget<T>(
  raw: string, items: readonly T[], keys: readonly TargetKey<T>[],
): Resolution<T> {
  for (const key of keys) {
    const hits = items.filter((it) => {
      const k = key(it)
      return k != null && String(k) === raw
    })
    if (hits.length === 1) return { kind: 'found', item: hits[0]! }
    if (hits.length > 1) return { kind: 'ambiguous', candidates: hits }
  }
  return { kind: 'unknown' }
}

/** Ce qui s'offre au lecteur quand l'adresse n'ouvre rien : un candidat, le bon projet. */
export interface TargetChoice {
  key: string
  label: string
  hint?: string | null
  to: string
}

export interface TargetRefusal {
  what: string            // l'objet DEMANDÉ : `#344`, `« proc-x »`
  code: string | null     // `403 forbidden` tel que le serveur l'a rendu ; null hors réponse serveur
  detail: string | null   // la phrase du serveur, à défaut la traduction du code
}

/** Le refus tel que le serveur l'a rendu : son code et sa phrase, jamais un autre objet. */
export function targetRefusal(what: string, e: unknown): TargetRefusal {
  if (e instanceof ApiError) {
    const code = `${e.status} ${e.code}`
    const human = humanize(e)
    return { what, code, detail: e.detail?.trim() || (human !== code ? human : null) }
  }
  return { what, code: null, detail: humanize(e) }
}
