// Une case de ligne telle que la sert la relecture RÉINSCRIPTIBLE
// (`GET …/rows/{id}?empties=sentinel&layers=nested`, contrat oto#204 étape 2), et la
// forme sous laquelle l'éditeur la RENVOIE quand il ne l'a pas touchée. Fonctions pures.
//
// En `layers=nested`, seule une case qui porte une couche est enveloppée
// `{valeur, comment?, link?, origine?}` ; une case sans couche reste nue. Un vide
// ASSUMÉ, lui, est toujours enveloppé — `{"valeur":"@empty"}` — au premier niveau comme
// dans une cellule d'élément de liste.

/** Le vide assumé : « cherché, rien ». Le SEUL marqueur du contrat d'écriture d'une case
 * (oto#140, 23/09/2026) ; l'autre geste, effacer, est `null` — valeur et marqueur compris.
 * `@clear` et `@keep` sont refusés par le backend à partir du 08/10/2026 : jamais écrits ici. */
export const VIDE_ASSUME = '@empty'

const COUCHES = ['valeur', 'comment', 'link', 'origine']

export type CaseEnveloppee = Record<string, unknown> & { valeur: unknown }

export function estEnveloppee(v: unknown): v is CaseEnveloppee {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.prototype.hasOwnProperty.call(v, 'valeur')
}

export const valeurDe = (v: unknown): unknown => (estEnveloppee(v) ? v.valeur : v)

export const estVideAssume = (v: unknown): boolean => valeurDe(v) === VIDE_ASSUME

/** `adresse.comment` : une couche servie À PLAT (lecture par défaut), pas une colonne. */
export function estCleDeCouche(cle: string): boolean {
  const i = cle.lastIndexOf('.')
  return i > 0 && COUCHES.includes(cle.slice(i + 1))
}

/** Copie profonde d'une valeur de ligne — JSON par construction (elle sort de l'API).
 * PAS `structuredClone` : la ligne arrive en valeur RÉACTIVE, donc ses valeurs imbriquées
 * sont des Proxy Vue, que l'algorithme de clonage structuré refuse (`DataCloneError` —
 * Sentry, 2 users). L'aller-retour JSON déproxifie ET copie en profondeur d'un seul geste. */
export const copie = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/**
 * La case d'une colonne qu'on MODIFIE : l'objet tel que lu, `comment` et `link` compris,
 * avec seule `valeur` changée — une valeur écrite sans ses couches les fait TOMBER
 * (contrat oto#204 étape 2). `origine` n'est jamais renvoyée : elle survit d'elle-même.
 * Une case lue nue part nue.
 *
 * ⚠️ Effacer part en `null` NU (oto#140) : le commentaire et le lien décrivaient la valeur
 * effacée et partent avec elle. `{valeur: null, comment, link}` efface la valeur mais
 * LAISSE les couches, orphelines sur une case vide (vérifié en prod, v1.335.0). L'éditeur
 * n'offre pas l'édition des couches : aucune n'a donc à être renvoyée à côté d'un `null`.
 */
export function avecCouches(lue: unknown, valeur: unknown): unknown {
  if (valeur === null || !estEnveloppee(lue)) return valeur
  const out: Record<string, unknown> = copie(lue)
  delete out.origine
  out.valeur = valeur
  return out
}

/** Les couches ÉDITABLES d'une case (oto#216) : son commentaire et son lien, en texte.
 * `origine` n'en fait pas partie — elle se lit, elle ne s'écrit pas. */
export interface Couches { comment: string; link: string }

export function couchesDe(v: unknown): Couches {
  if (!estEnveloppee(v)) return { comment: '', link: '' }
  return { comment: v.comment == null ? '' : String(v.comment), link: v.link == null ? '' : String(v.link) }
}

export const memesCouches = (a?: Couches, b?: Couches): boolean =>
  (a?.comment ?? '').trim() === (b?.comment ?? '').trim() && (a?.link ?? '').trim() === (b?.link ?? '').trim()

/**
 * La case écrite avec les couches SAISIES (oto#216) : la valeur, puis `comment` et `link`
 * tels que saisis. Une couche vidée est OMISE — écrite sans elle, elle tombe (contrat
 * oto#204 étape 2) : c'est le geste « retirer le commentaire », sans marqueur à inventer.
 * `origine` n'est jamais renvoyée. Une valeur effacée part en `null` nu, couches comprises
 * (oto#140). Sans aucune couche, une case lue nue repart nue.
 */
export function caseAvecCouches(lue: unknown, valeur: unknown, c: Couches): unknown {
  if (valeur === null) return null
  const out: Record<string, unknown> = estEnveloppee(lue) ? copie(lue) : {}
  delete out.origine; delete out.comment; delete out.link
  out.valeur = valeur
  if (c.comment.trim()) out.comment = c.comment.trim()
  if (c.link.trim()) out.link = c.link.trim()
  return Object.keys(out).length === 1 && !estEnveloppee(lue) ? valeur : out
}

/**
 * Une case qu'on renvoie SANS l'avoir touchée : la même que la lecture, moins `origine`,
 * que l'écran ne renvoie jamais. Si la couche retirée ne laisse qu'une valeur `null`, on
 * ne nomme que les couches restantes — renvoyer `null` effacerait ; s'il ne reste rien, la
 * case n'est pas renvoyée (`undefined`).
 */
export function caseIntacte(v: unknown): unknown {
  if (!estEnveloppee(v)) return copie(v)
  const reste: Record<string, unknown> = copie(v)
  delete reste.origine
  if (reste.valeur === null) delete reste.valeur
  return Object.keys(reste).length ? reste : undefined
}
