// Cycle de vie d'un tableau typé (ADR 0046) — le graphe des transitions déclarées
// au schéma. Le serveur en est SOUVERAIN : il refuse toute transition non déclarée.
// Annuler un changement d'état n'est donc pas un « retour arrière » privilégié,
// c'est un TRAJET dans le même graphe, aux mêmes règles.
import type { DatastoreField, DatastoreLifecycle } from '@/types/api'

/** Ce qui porte un cycle de vie : une colonne du schéma (`DatastoreField`), ou le seul
 * bloc quand l'appelant n'a que lui. */
export type PorteurDeCycle = { lifecycle?: DatastoreLifecycle | null }

/**
 * Libellé LISIBLE d'un état. Le cycle de vie peut le DÉCLARER (`lifecycle.labels`,
 * oto#140 : `a_qualifier` → « À qualifier ») ; à défaut, règle GÉNÉRIQUE, aucun
 * dictionnaire : les `_` deviennent des espaces, la première lettre passe en capitale
 * (`non_interesse` → « Non interesse »). Aucun accent n'est deviné : une règle qui en
 * poserait se tromperait un jour sans le dire — c'est pour ça que le libellé se déclare.
 * ⚠️ Point UNIQUE de lecture des libellés. `champ` est OBLIGATOIRE (même `null`) : un
 * appelant qui l'oublierait afficherait le code dérivé à côté d'un écran qui affiche le
 * libellé déclaré, et rien ne le signalerait.
 */
export function etatLisible(code: string, champ: PorteurDeCycle | null | undefined): string {
  const declare = champ?.lifecycle?.labels?.[String(code)]
  if (typeof declare === 'string' && declare.trim()) return declare
  const s = String(code).replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : String(code)
}

/** Une colonne d'avancement : `role: "status"` AVEC un cycle de vie déclaré. */
export const estStatutACycle = (f: DatastoreField | null | undefined): boolean =>
  f?.role === 'status' && (f.lifecycle?.states?.length ?? 0) > 0

/** Les étapes finales : `terminal` déclaré, sinon les états sans transition sortante. */
export function etatsTerminaux(lc: DatastoreLifecycle | null | undefined): Set<string> {
  if (!lc) return new Set()
  if (lc.terminal?.length) return new Set(lc.terminal.map(String))
  const sortants = new Set(Object.entries(lc.transitions ?? {})
    .filter(([, vers]) => vers?.length).map(([de]) => de))
  return new Set((lc.states ?? []).map(String).filter((s) => !sortants.has(s)))
}

/** Le geste de transition tel qu'il a été posé : on retient l'état d'AVANT, seul
 * moment où il est encore connu (après l'écriture, la fiche ne porte plus que
 * l'état d'après). */
export interface LifecycleIntent {
  key: string             // champ role="status" muté
  from: string | null     // état avant le clic (null = fiche sans état)
  to: string              // état demandé
}

/** Ce qu'on dit à l'utilisateur après une transition, et ce qu'il faut rejouer
 * pour revenir en arrière. */
export interface TransitionAnnounce {
  /** Confirmation : NOMME la ligne touchée et le changement (c'est l'information
   * qui manquait quand on cliquait sans savoir sur quoi). */
  message: string
  /** Sauts à appliquer, dans l'ordre, pour revenir à l'état d'avant. `null` =
   * retour impossible ; le message le dit alors, et l'UI ne propose rien. */
  undo: string[] | null
}

/** Confirmation + plan de retour d'une transition qui vient d'être appliquée. Les
 * états y sont nommés comme partout ailleurs (`etatLisible`, libellés déclarés). */
export function transitionAnnounce(
  rowLabel: string,
  t: LifecycleIntent,
  champ: PorteurDeCycle | null | undefined,
): TransitionAnnounce {
  const transitions = champ?.lifecycle?.transitions
  const de = t.from ? etatLisible(t.from, champ) : '—'
  const vers = etatLisible(t.to, champ)
  const done = `« ${rowLabel} » : ${de} → ${vers}`
  if (!t.from) return { message: done, undo: null }   // pas d'état d'avant : rien à rétablir
  const back = transitionPath(transitions, t.to, t.from)
  if (!back || !back.length)
    return {
      message: `${done} — retour impossible : aucun chemin déclaré de « ${vers} » vers « ${de} ».`,
      undo: null,
    }
  return { message: done, undo: back }
}

/**
 * Plus court chemin LÉGAL de `from` vers `to` dans le graphe des transitions
 * (parcours en largeur). Retourne la suite d'états à traverser, `from` exclu et
 * `to` inclus — ex. `ecarte → a_enrichir → enrichi` donne `['a_enrichir', 'enrichi']`.
 *
 * - `[]` si `from === to` (rien à faire),
 * - `null` si aucun chemin n'existe : le retour est alors IMPOSSIBLE, et l'UI doit
 *   le dire plutôt que proposer une annulation vouée à un refus serveur.
 */
export function transitionPath(
  transitions: Record<string, string[]> | undefined | null,
  from: string,
  to: string,
): string[] | null {
  if (from === to) return []
  if (!transitions) return null
  const seen = new Set<string>([from])
  // File de parcours : chaque entrée porte le chemin complet qui y mène.
  const queue: Array<{ state: string; path: string[] }> = [{ state: from, path: [] }]
  while (queue.length) {
    const { state, path } = queue.shift()!
    for (const next of transitions[state] ?? []) {
      if (seen.has(next)) continue
      const nextPath = [...path, next]
      if (next === to) return nextPath
      seen.add(next)
      queue.push({ state: next, path: nextPath })
    }
  }
  return null
}
