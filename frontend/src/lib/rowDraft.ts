// Le brouillon d'une ligne dans l'éditeur (RowDrawer) et ce qu'il ÉCRIT (oto#213).
// Fonctions pures.
//
// Quatre règles ferment le défaut « l'éditeur élague les vides assumés et renvoie des
// colonnes non touchées » :
//   1. Le brouillon naît de la ligne RELUE, et l'écriture en est la DIFFÉRENCE : une
//      colonne n'est nommée que si sa saisie a changé. Aller-retour sans modification =
//      corps vide = aucun PATCH. Un ajout est la différence avec une ligne vide.
//   2. Rien n'est élagué, ni retiré sans geste : une colonne liste part ENTIÈRE, chaque
//      élément tel que relu (ses `""`, ses `{"valeur":"@empty"}`), moins `origine`, et
//      seules ses cellules modifiées sont réécrites.
//   3. Une case modifiée garde ses couches : l'objet tel que lu, `valeur` seule changée
//      (`avecCouches`) — sinon `comment` et `link` tombent. Sauf une case effacée : elle
//      part en `null` NU, ses couches avec elle (sinon elles restent, orphelines).
//   4. Vider est un geste (contrat à deux gestes, oto#140 du 23/09/2026) : une saisie
//      effacée part en `null`, qui efface quel que soit le type — jamais `""` ni `[]`, qui
//      REMPLACENT la valeur en place à partir du 06/10/2026, ni `@clear`, refusé au
//      08/10/2026. Un vide assumé part en `@empty`, là où le contrat accepte le marqueur :
//      une colonne scalaire (pas `json`), et une cellule d'élément de liste de sous-records
//      sauf son attribut d'identité (`of.key`). Retirer le vide assumé sans valeur = `null`.
import type { DatastoreField } from '@/types/api'
import {
  VIDE_ASSUME, avecCouches, caseAvecCouches, caseIntacte, copie, couchesDe, estVideAssume,
  memesCouches, valeurDe, type Couches,
} from './rowCells'

const SANS_COUCHES: Couches = { comment: '', link: '' }
import { isComposite, isSubRecordList, payloadValue, scalarDraft, type FieldDesc } from './datastoreForm'

/** Saisie d'un élément de liste (ou d'un objet) : un texte et un vide assumé par sous-champ. */
export interface ElementSaisi {
  lu: unknown                        // l'élément tel que relu ; `undefined` = ajouté dans l'éditeur
  textes: Record<string, string>
  vides: Record<string, boolean>
  couches: Record<string, Couches>   // par sous-champ (oto#216)
}
export type CompositeSaisi =
  | { sorte: 'elements'; elements: ElementSaisi[] }  // liste de sous-records
  | { sorte: 'objet'; element: ElementSaisi }        // objet
  | { sorte: 'valeurs'; valeurs: unknown[] }          // liste de scalaires
export interface Brouillon {
  scalaires: Record<string, string>
  vides: Record<string, boolean>
  composites: Record<string, CompositeSaisi>
  couches: Record<string, Couches>                // commentaire et lien d'une case (oto#216)
}

const estRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** Colonne où le contrat accepte le vide assumé (`@empty`) : scalaire, et pas `json`. */
export const accepteVideColonne = (d: FieldDesc): boolean =>
  !(d.declared && (isComposite(d.field) || d.type === 'json'))

/** Sous-champ où le contrat accepte le vide assumé : liste de sous-records, hors `of.key`. */
export const accepteVideSousChamp = (f: DatastoreField, sousCle: string): boolean =>
  isSubRecordList(f) && f.of?.key !== sousCle

/** Un élément relu qui n'est pas un sous-record (`null`, un scalaire) : rendu et renvoyé tel quel. */
export const estElementBrut = (e: ElementSaisi): boolean => e.lu !== undefined && !estRecord(e.lu)

function texteSousCase(v: unknown): string {
  const x = valeurDe(v)
  if (x == null || x === VIDE_ASSUME) return ''
  return typeof x === 'object' ? JSON.stringify(x) : String(x)
}

/** La saisie d'un élément tel que relu — c'est aussi la référence de ce qui a changé. */
export function elementSaisi(lu: unknown): ElementSaisi {
  const textes: Record<string, string> = {}
  const vides: Record<string, boolean> = {}
  const couches: Record<string, Couches> = {}
  if (estRecord(lu)) {
    for (const [k, v] of Object.entries(lu)) {
      textes[k] = texteSousCase(v)
      if (estVideAssume(v)) vides[k] = true
      couches[k] = couchesDe(v)
    }
  }
  return { lu: copie(lu), textes, vides, couches }
}

export function compositeSaisi(f: DatastoreField, cellule: unknown): CompositeSaisi {
  const v = valeurDe(cellule)
  if (f.type === 'object') return { sorte: 'objet', element: elementSaisi(estRecord(v) ? v : undefined) }
  const liste: unknown[] = Array.isArray(v) ? copie(v) : v == null || v === '' ? [] : [copie(v)]
  if (isSubRecordList(f)) return { sorte: 'elements', elements: liste.map((x) => elementSaisi(x)) }
  return { sorte: 'valeurs', valeurs: liste }
}

/** (Re)pose UNE colonne du brouillon depuis sa case relue. */
export function poserColonne(b: Brouillon, d: FieldDesc, cellule: unknown): void {
  if (d.declared && isComposite(d.field)) {
    b.composites[d.key] = compositeSaisi(d.field!, cellule)
    return
  }
  const vide = estVideAssume(cellule)
  b.couches[d.key] = couchesDe(cellule)
  b.scalaires[d.key] = vide ? '' : scalarDraft(valeurDe(cellule))
  if (vide) b.vides[d.key] = true
  else delete b.vides[d.key]
}

/** Recopie UNE colonne d'un brouillon dans un autre (reprise après conflit). */
export function recopierColonne(vers: Brouillon, depuis: Brouillon, cle: string): void {
  if (cle in depuis.composites) vers.composites[cle] = depuis.composites[cle]!
  if (cle in depuis.scalaires) vers.scalaires[cle] = depuis.scalaires[cle]!
  if (depuis.vides[cle]) vers.vides[cle] = true
  else delete vers.vides[cle]
}

export function brouillonDeLigne(champs: FieldDesc[], ligne: Record<string, unknown> | null): Brouillon {
  const b: Brouillon = { scalaires: {}, vides: {}, composites: {}, couches: {} }
  for (const d of champs) poserColonne(b, d, ligne?.[d.key])
  return b
}

// ── ce qu'une saisie DIT, ramené à ce qui compte : un vide assumé, rien, ou un texte ──
type Forme = { sorte: 'vide' } | { sorte: 'rien' } | { sorte: 'texte'; texte: string }

function forme(texte: string | undefined, vide: boolean | undefined): Forme {
  const t = texte ?? ''
  if (t.trim() === '') return vide ? { sorte: 'vide' } : { sorte: 'rien' }
  return { sorte: 'texte', texte: t }
}
const memeForme = (a: Forme, b: Forme): boolean =>
  a.sorte === b.sorte && (a.sorte !== 'texte' || a.texte === (b as { texte: string }).texte)

/** Ce qu'on écrit pour une saisie qui a CHANGÉ. Passer de quelque chose à rien = `null`,
 * qui efface ; `@empty` seulement là où le marqueur est accepté. */
function ecritureSaisie(apres: Forme, videAccepte: boolean, texte: (t: string) => unknown): unknown {
  if (apres.sorte === 'texte') return texte(apres.texte)
  return apres.sorte === 'vide' && videAccepte ? VIDE_ASSUME : null
}

/** Un élément tel qu'on le renvoie : relu intact (moins `origine`), cellules modifiées réécrites. */
export function ecritureElement(e: ElementSaisi, videAccepte: (sousCle: string) => boolean): unknown {
  if (estElementBrut(e)) return copie(e.lu)
  const lu = estRecord(e.lu) ? e.lu : {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(lu)) {
    const c = caseIntacte(v)
    if (c !== undefined) out[k] = c
  }
  const ref = elementSaisi(e.lu)
  for (const k of new Set([...Object.keys(e.textes), ...Object.keys(e.vides), ...Object.keys(e.couches ?? {})])) {
    const apres = forme(e.textes[k], e.vides[k])
    const inchangee = memeForme(forme(ref.textes[k], ref.vides[k]), apres)
    const coucheBouge = !memesCouches(ref.couches[k], e.couches?.[k])
    if (inchangee && !coucheBouge) continue
    const valeur = inchangee ? valeurDe(lu[k]) : ecritureSaisie(apres, videAccepte(k), (t) => t)
    // Une couche ne se pose pas sur une case sans valeur : rien à décrire (oto#216).
    if (inchangee && valeur == null) continue
    out[k] = coucheBouge
      ? caseAvecCouches(lu[k], valeur ?? null, e.couches?.[k] ?? SANS_COUCHES)
      : avecCouches(lu[k], valeur)
  }
  return out
}

function ecritureComposite(f: DatastoreField, c: CompositeSaisi | undefined): unknown {
  if (!c) return undefined
  if (c.sorte === 'valeurs') return copie(c.valeurs)
  if (c.sorte === 'objet') return ecritureElement(c.element, () => false)
  return c.elements.map((e) => ecritureElement(e, (k) => accepteVideSousChamp(f, k)))
}

/** La valeur à écrire pour une colonne, si sa saisie a changé entre `avant` et `apres`. */
function changement(d: FieldDesc, lue: unknown, avant: Brouillon, apres: Brouillon): { valeur: unknown } | null {
  if (d.declared && isComposite(d.field)) {
    const a = ecritureComposite(d.field!, avant.composites[d.key])
    const b = ecritureComposite(d.field!, apres.composites[d.key])
    if (JSON.stringify(a) === JSON.stringify(b)) return null
    // une liste VIDÉE efface (`null`) : `[]` remplacerait la valeur en place (06/10/2026)
    return { valeur: avecCouches(lue, Array.isArray(b) && b.length === 0 ? null : b) }
  }
  const fa = forme(avant.scalaires[d.key], avant.vides[d.key])
  const fb = forme(apres.scalaires[d.key], apres.vides[d.key])
  const inchangee = memeForme(fa, fb)
  // Le commentaire ou le lien a bougé (oto#216) : la case part AVEC la valeur relue,
  // inchangée — modifier seulement un commentaire n'envoie que cette colonne.
  const coucheBouge = !memesCouches(avant.couches[d.key], apres.couches[d.key])
  if (inchangee && !coucheBouge) return null
  const valeur = inchangee ? valeurDe(lue) : ecritureSaisie(fb, accepteVideColonne(d), (t) => payloadValue(d, t))
  if (inchangee && valeur == null) return null   // pas de couche sur une case vide
  return { valeur: coucheBouge
    ? caseAvecCouches(lue, valeur ?? null, apres.couches[d.key] ?? SANS_COUCHES)
    : avecCouches(lue, valeur) }
}

/** Le corps d'une écriture : les SEULES colonnes dont la saisie diffère de la ligne relue.
 * Un ajout passe `{}` comme ligne relue : n'y part que ce qui a été saisi. */
export function correctif(
  champs: FieldDesc[], lu: Record<string, unknown>, courant: Brouillon,
): Record<string, unknown> {
  const initial = brouillonDeLigne(champs, lu)
  const out: Record<string, unknown> = {}
  for (const d of champs) {
    const c = changement(d, lu[d.key], initial, courant)
    if (c) out[d.key] = c.valeur
  }
  return out
}
