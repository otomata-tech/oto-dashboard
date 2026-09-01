// Ce que l'écran des passages doit savoir DIRE, sorti du composant pour être
// éprouvé. Deux règles y sont gravées, et chacune vient d'un défaut payé :
//
//   1. un passage `running` qui ne bat plus est un RÉSIDU, pas une concurrence ;
//   2. le budget se compte en JETONS — jamais converti en monnaie.
import type { RunnerFleet, RunnerFleetState } from '@/types/api.attendu'

/** Au-delà de ce silence, un passage `running` n'est plus vivant : personne ne
 * l'a arrêté, il est simplement mort en laissant son état à `running`. */
export const RESIDU_MS = 10 * 60 * 1000

/** ⚠️ Un passage `running` qui ne bat plus n'est PAS une flotte à attendre.
 *
 * Sans cette distinction, un second passage se heurte à un refus que rien ne
 * justifie, quelqu'un désarme à la main — et désarmer devient le geste normal.
 * Un `heartbeat_at` absent sur un `running` compte comme un résidu : une flotte
 * qui bat écrit son battement ; ne rien avoir écrit n'est pas rassurant. */
export function estResidu(f: RunnerFleet, maintenant = Date.now()): boolean {
  if (f.status !== 'running') return false
  if (!f.heartbeat_at) return true
  const t = Date.parse(f.heartbeat_at)
  if (!Number.isFinite(t)) return true   // illisible ⟹ on ne certifie pas vivant
  return maintenant - t > RESIDU_MS
}

/** Des jetons, lisibles, et JAMAIS convertis en monnaie.
 *
 * ⚠️ Les tarifs changent et diffèrent par fournisseur : une somme affichée ici
 * serait fausse un mois plus tard sans que rien ne le dise. La conversion
 * appartient à qui lit, avec un tarif daté.
 *
 * ⚠️ Et l'absence rend `null`, pas `"0"` : on n'écrit pas un zéro là où on ne
 * sait pas — c'est le défaut qui a coûté le plus cher sur ce chantier. */
export function jetons(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`
  return String(n)
}

export type Ton = 'olive' | 'saffron' | 'terra' | 'cobalt' | 'ink'

const TONS: Record<string, Ton> = {
  running: 'olive', done: 'cobalt', stopped: 'ink', failed: 'terra', draft: 'ink',
}

/** Un statut inconnu retombe sur `ink` plutôt que de casser l'affichage : le
 * jeu d'états peut s'élargir côté serveur avant que cet écran ne le sache. */
export function ton(f: RunnerFleet): Ton {
  return TONS[f.status || 'draft'] ?? 'ink'
}

/** ⚠️ Ce que l'écran doit dire d'un état, et ce qu'il ne doit JAMAIS dire.
 *
 * `no_jobs_attached` est déclaré par le serveur : un passage sans travail
 * rattaché le DIT. L'écran ne doit pas afficher des compteurs à zéro, qui se
 * lisent « un passage vide et sage » alors qu'ils peuvent vouloir dire « ses
 * travaux sont partis sans rattachement » — deux situations opposées. */
export function ditLeVide(e: RunnerFleetState | null): boolean {
  return e !== null && e.no_jobs_attached
}
