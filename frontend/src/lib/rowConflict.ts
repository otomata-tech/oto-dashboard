// Un conflit de révision (409 `revision_conflict`) se RÉSOUT par la personne, jamais par
// un nouvel essai (oto#213). Ce module confronte trois états — la ligne relue à
// l'ouverture, la version relue après le refus, le brouillon — et dit, colonne par
// colonne, ce qui s'y oppose ; puis il reprend le brouillon sur la version relue selon ce
// qui a été tranché. Il n'écrit rien : la personne réenregistre elle-même, sur la
// nouvelle révision, et seule la différence avec la version relue part.
import type { FieldDesc } from './datastoreForm'
import { brouillonDeLigne, correctif, recopierColonne, type Brouillon } from './rowDraft'

/** `les-deux` : modifiée ailleurs ET dans le brouillon — la personne doit trancher.
 * `ailleurs` : modifiée ailleurs seulement — la version relue sera reprise.
 * `brouillon` : modifiée dans le brouillon seulement — la saisie est gardée. */
export type Opposition = 'les-deux' | 'ailleurs' | 'brouillon'
export type Choix = 'relue' | 'brouillon'

export interface ColonneOpposee {
  cle: string
  libelle: string
  opposition: Opposition
  relue: unknown     // la case de la version relue
  ecrite: unknown    // ce que le brouillon écrirait (absent si `ailleurs`)
}

const memeCase = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function colonnesOpposees(
  champs: FieldDesc[], lu: Record<string, unknown>, relue: Record<string, unknown>,
  courant: Brouillon,
): ColonneOpposee[] {
  const mien = correctif(champs, lu, courant)
  const out: ColonneOpposee[] = []
  for (const d of champs) {
    const ailleurs = !memeCase(lu[d.key], relue[d.key])
    const brouillon = Object.prototype.hasOwnProperty.call(mien, d.key)
    if (!ailleurs && !brouillon) continue
    out.push({
      cle: d.key, libelle: d.label, relue: relue[d.key], ecrite: mien[d.key],
      opposition: ailleurs && brouillon ? 'les-deux' : ailleurs ? 'ailleurs' : 'brouillon',
    })
  }
  return out
}

export const conflitTranche = (colonnes: ColonneOpposee[], choix: Record<string, Choix>): boolean =>
  colonnes.every((c) => c.opposition !== 'les-deux' || !!choix[c.cle])

/** Le brouillon repris sur la version relue : une colonne garde la saisie si elle n'a
 * changé que dans le brouillon, ou si la personne l'a choisie ; toute autre — dont
 * celles que la personne n'a pas touchées — prend la version relue. */
export function reprendreBrouillon(
  champs: FieldDesc[], lu: Record<string, unknown>, relue: Record<string, unknown>,
  courant: Brouillon, choix: Record<string, Choix>,
): Brouillon {
  const neuf = brouillonDeLigne(champs, relue)
  for (const c of colonnesOpposees(champs, lu, relue, courant)) {
    if (c.opposition === 'brouillon' || (c.opposition === 'les-deux' && choix[c.cle] === 'brouillon'))
      recopierColonne(neuf, courant, c.cle)
  }
  return neuf
}
