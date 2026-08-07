// Cycle de vie d'un tableau typé (ADR 0046) — le graphe des transitions déclarées
// au schéma. Le serveur en est SOUVERAIN : il refuse toute transition non déclarée.
// Annuler un changement d'état n'est donc pas un « retour arrière » privilégié,
// c'est un TRAJET dans le même graphe, aux mêmes règles.

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

/** Confirmation + plan de retour d'une transition qui vient d'être appliquée. */
export function transitionAnnounce(
  rowLabel: string,
  t: LifecycleIntent,
  transitions: Record<string, string[]> | undefined | null,
): TransitionAnnounce {
  const done = `« ${rowLabel} » : ${t.from ?? '—'} → ${t.to}`
  if (!t.from) return { message: done, undo: null }   // pas d'état d'avant : rien à rétablir
  const back = transitionPath(transitions, t.to, t.from)
  if (!back || !back.length)
    return {
      message: `${done} — retour impossible : aucun chemin déclaré de « ${t.to} » vers « ${t.from} ».`,
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
