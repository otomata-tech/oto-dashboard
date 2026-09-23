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
 * (contrat oto#204 étape 2), y compris à côté d'un `null` qui efface. `origine` n'est jamais
 * renvoyée : elle survit d'elle-même. Une case lue nue part nue.
 */
export function avecCouches(lue: unknown, valeur: unknown): unknown {
  if (!estEnveloppee(lue)) return valeur
  const out: Record<string, unknown> = copie(lue)
  delete out.origine
  out.valeur = valeur
  return out
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
