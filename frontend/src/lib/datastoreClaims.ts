// Ce que la FILE DE TRAVAIL sait d'une ligne (oto-backend#433) : combien de fois
// elle a été réservée sans qu'on écrive rien (`_claims`), contre le plafond déclaré
// au cycle de vie (`lifecycle.max_claims`) — et, quand le plafond l'a sortie de la
// file, le motif que le serveur y a posé (`_abandon`).
//
// ⚠️ MIROIR DU SERVEUR, au même titre que `keyStack.ts` : rien ne se décide ici, on
// LIT ce que le backend a servi. Trois règles qui viennent de lui, et qu'aucun écran
// ne doit ré-inventer :
//
//  1. **le motif se rend TEL QUEL.** Il cite ses chiffres (« abandonnée après 3
//     réservations sans écriture, plafond 3 ») parce que le plafond a pu changer
//     depuis : reformulé ou recalculé côté écran, il annoncerait un verdict qu'on ne
//     peut plus ni vérifier ni rejouer. Le serveur ne fait même pas l'accord au
//     singulier — on ne le corrige pas non plus.
//  2. **`_claims` et `_abandon` ne sont servis que s'ils portent quelque chose** :
//     clé ABSENTE plutôt que `0`/`null` (un `_claims: 0` sur chaque ligne de chaque
//     tableau serait du bruit). Absent = « la file n'a rien à en dire ».
//  3. **le compteur retombe à zéro à la première écriture réussie**, qui efface aussi
//     le motif : c'est ce qui rouvre une ligne abandonnée. Mais la plateforme verse la
//     ligne dans l'état d'abandon sans s'autoriser à l'en sortir — rouvrir son STATUT
//     suppose que le cycle de vie déclare la transition de retour. Sans elle, une
//     écriture qui change le statut est REFUSÉE : d'où `reopens`, qui dit à l'écran
//     s'il peut proposer un retour ou s'il doit annoncer un statut gelé.
import type { DatastoreLifecycle, DatastoreRow } from '@/types/api'

/** Le compteur de réservations sans écriture d'une ligne, lu contre le plafond. */
export interface ClaimBudget {
  /** `_claims` : réservations depuis la dernière écriture réussie. Toujours ≥ 1
   *  (à 0 le serveur n'envoie rien, et cette structure vaut `null`). */
  claims: number
  /** `lifecycle.max_claims`, ou `null` quand le tableau ne déclare aucun plafond. */
  max: number | null
  /** « 2/3 » avec plafond, « 2 » sans — la forme courte des bandeaux et des chips. */
  label: string
  /** Le compte a rejoint le plafond : à la prochaine libération sans écriture, la
   *  ligne quitte la file. Toujours `false` sans plafond déclaré. */
  atCeiling: boolean
}

/** Le verdict d'abandon d'une ligne : le motif du serveur, et ce que le cycle de vie
 *  autorise pour la remettre en route. */
export interface AbandonVerdict {
  /** `_abandon`, MOT POUR MOT tel que le serveur l'a posé. */
  reason: string
  /** États déclarés en sortie de l'état courant. Vide = aucune transition de retour
   *  déclarée : une écriture rouvrira la file (compteur et motif tombent) mais le
   *  statut, lui, restera celui de l'abandon. */
  reopens: string[]
}

/** Un entier servi par le backend, ou `null` si la clé ne porte rien d'exploitable.
 *  Strict par choix : le contrat sert un `int`, et une chaîne « 2 » signalerait une
 *  dérive de contrat qu'on ne veut pas masquer en la parsant. */
function entier(v: unknown, min: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min ? v : null
}

/** Le plafond déclaré sur le cycle de vie, ou `null` (garde inactive). */
export function maxClaims(lifecycle?: DatastoreLifecycle | null): number | null {
  return entier(lifecycle?.max_claims, 1)
}

/** L'état terminal où le serveur verse une ligne à bout de réservations, ou `null`. */
export function abandonState(lifecycle?: DatastoreLifecycle | null): string | null {
  const s = lifecycle?.abandon_state
  return typeof s === 'string' && s !== '' ? s : null
}

/**
 * Le compteur de réservations d'une ligne — `null` quand la file n'a rien à en dire
 * (aucune réservation depuis la dernière écriture : le serveur n'envoie pas la clé).
 */
export function claimBudget(
  row: DatastoreRow | null | undefined,
  lifecycle?: DatastoreLifecycle | null,
): ClaimBudget | null {
  const claims = entier(row?._claims, 1)
  if (claims === null) return null
  const max = maxClaims(lifecycle)
  return {
    claims,
    max,
    label: max === null ? String(claims) : `${claims}/${max}`,
    // `>=` et non `===` : le motif du serveur peut citer un compte SUPÉRIEUR au
    // plafond (il a pu être resserré depuis, ou la passe d'abandon n'a pas encore eu
    // lieu). Un `===` laisserait ces lignes-là sans signal.
    atCeiling: max !== null && claims >= max,
  }
}

/**
 * Ce que le serveur a écrit d'une ligne abandonnée, et les retours que le cycle de
 * vie déclare depuis son état courant. `null` = la ligne n'est pas abandonnée.
 *
 * `statusKey` est la clé du champ `role="status"` : c'est LUI qui porte l'état, le
 * motif vivant à côté dans une colonne de plateforme.
 */
export function abandonVerdict(
  row: DatastoreRow | null | undefined,
  statusKey: string | null | undefined,
  lifecycle?: DatastoreLifecycle | null,
): AbandonVerdict | null {
  const reason = row?._abandon
  if (typeof reason !== 'string' || reason === '') return null
  const etat = statusKey ? row?.[statusKey] : null
  const courant = etat == null || etat === '' ? null : String(etat)
  const sorties = courant === null ? [] : (lifecycle?.transitions?.[courant] ?? [])
  return { reason, reopens: sorties.map(String) }
}
