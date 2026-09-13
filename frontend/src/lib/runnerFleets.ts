// Ce que l'écran des CAMPAGNES doit savoir dire, sorti des composants pour être
// éprouvé (oto#205). Une campagne est une flotte déclarée (`runner.fleets`).
//
// Les règles du modèle, fixées par la session flotte, que ce module tient :
//   • `armed` est une INTENTION (aucun travail), `running` un FAIT (un travail a été
//     produit) : ne jamais afficher `armed` comme lancée ;
//   • `stopping` est une DEMANDE : la dépense continue tant qu'un travail est en vol ;
//     ne jamais l'afficher comme arrêtée ;
//   • une flotte `draft` qui porte des travaux est un HISTORIQUE de l'ancien
//     ordonnanceur : elle se lit d'après ses travaux, jamais d'après son statut ;
//   • le battement (`heartbeat_at`) ne se lit PAS : seul l'ancien ordonnanceur le posait.
import type { RunnerFleet, RunnerFleetState } from '@/types/api'
import { instant, type LibelleStatut, type Ton } from './runnerJobs'

export { jetons } from './runnerJobs'

/** Les statuts d'une campagne vivante : elle peut encore produire ou dépenser. */
export const STATUTS_VIVANTS = ['armed', 'running', 'stopping'] as const

/** Au-delà, une campagne non vivante sans changement d'état se range dans le repli. */
export const RECENTE_JOURS = 7
const RECENTE_MS = RECENTE_JOURS * 24 * 3_600_000

/** Une campagne `armed` qui n'a rien produit au bout de ce délai n'attend pas son
 * tour : d'après la plateforme, aucun worker ne sonde la file de l'org. */
export const ARMEE_SANS_TRAVAIL_MS = 60_000

/** Le nom d'une campagne : son libellé, sa procédure, à défaut son identifiant. */
export function nomCampagne(f: Pick<RunnerFleet, 'id' | 'label' | 'procedure'>): string {
  return f.label || f.procedure || `#${f.id}`
}

export function estVivante(f: Pick<RunnerFleet, 'status'>): boolean {
  return (STATUTS_VIVANTS as readonly string[]).includes(f.status ?? '')
}

/** Le libellé qui dit le FAIT. `etat` vaut `null` tant que `op=state` n'est pas lu :
 * une campagne `draft` repliée ne peut pas encore dire si elle porte des travaux, et
 * elle ne se prétend donc ni brouillon ni historique. */
export function libelleCampagne(
  f: Pick<RunnerFleet, 'status' | 'stop_reason'>,
  etat: RunnerFleetState | null,
): LibelleStatut {
  const S = 'automations.campaign.status.'
  const l = (cle: string, ton: Ton, params: Record<string, string | number> = {}) =>
    ({ cle: `${S}${cle}`, params, ton })
  switch (f.status) {
    case 'draft':
      if (!etat) return l('draftUnread', 'ink')
      return etat.no_jobs_attached ? l('draft', 'ink') : l('historical', 'ink')
    case 'armed': return l('armed', 'saffron')
    case 'running': return l('running', 'olive')
    case 'stopping':
      return typeof etat?.claimed === 'number'
        ? l('stoppingInFlight', 'saffron', { n: etat.claimed })
        : l('stopping', 'saffron')
    case 'stopped':
      return f.stop_reason
        ? l('stopped', 'ink', { reason: f.stop_reason })
        : l('stoppedNoReason', 'ink')
    // Inatteignables selon le backend, libellés quand même : un état servi qu'on ne
    // sait pas dire serait pire qu'un libellé qui ne sert jamais.
    case 'done': return l('done', 'cobalt')
    case 'failed': return l('failed', 'terra')
    default: return l('unknown', 'saffron', { status: f.status ?? '—' })
  }
}

/** Le dernier changement d'état DÉCLARÉ (armement, démarrage, demande d'arrêt, arrêt,
 * création). Jamais le battement. `null` = aucune date lisible. */
export function derniereBascule(f: RunnerFleet): number | null {
  const ts = [f.armed_at, f.started_at, f.stopping_at, f.stopped_at, f.created_at]
    .map(instant).filter((t): t is number => t !== null)
  return ts.length ? Math.max(...ts) : null
}

export interface Repartition {
  vivantes: RunnerFleet[]
  recentes: RunnerFleet[]
  /** Repliées : sans changement d'état depuis `RECENTE_JOURS`, ou sans date lisible. */
  anciennes: RunnerFleet[]
}

/** Les vivantes d'abord, puis les récentes, puis le repli. Dans chaque groupe, la
 * plus récemment basculée en tête. */
export function repartir(fleets: RunnerFleet[], maintenant: number): Repartition {
  const par = (a: RunnerFleet, b: RunnerFleet) =>
    (derniereBascule(b) ?? 0) - (derniereBascule(a) ?? 0) || b.id - a.id
  const vivantes: RunnerFleet[] = []
  const recentes: RunnerFleet[] = []
  const anciennes: RunnerFleet[] = []
  for (const f of fleets) {
    if (estVivante(f)) { vivantes.push(f); continue }
    const t = derniereBascule(f)
    if (t !== null && maintenant - t <= RECENTE_MS) recentes.push(f)
    else anciennes.push(f)
  }
  return { vivantes: vivantes.sort(par), recentes: recentes.sort(par), anciennes: anciennes.sort(par) }
}

/** Armée depuis plus d'une minute sans premier travail : rend depuis combien de
 * temps, sinon `null`. Ne se prononce pas sans `armed_at` lisible — on n'invente pas
 * l'heure d'armement. */
export function armeeSansTravail(f: RunnerFleet, maintenant: number): number | null {
  if (f.status !== 'armed') return null
  const t = instant(f.armed_at)
  if (t === null) return null
  const depuis = maintenant - t
  return depuis > ARMEE_SANS_TRAVAIL_MS ? depuis : null
}

export interface Compteur {
  cle: 'done' | 'pending' | 'claimed' | 'failed' | 'abandoned'
  n: number | null
  alerte: boolean
}

/** Les compteurs de TOUTE la campagne, tels que `op=state` les agrège.
 * ⚠️ `abandoned` est un SOUS-ENSEMBLE de `failed` (échecs au plafond de tentatives) :
 * il se dit « dont », jamais à côté — sinon la somme dépasse le total. */
export function compteurs(etat: RunnerFleetState): Compteur[] {
  return [
    { cle: 'done', n: etat.done, alerte: false },
    { cle: 'pending', n: etat.pending, alerte: false },
    { cle: 'claimed', n: etat.claimed, alerte: false },
    { cle: 'failed', n: etat.failed, alerte: (etat.failed ?? 0) > 0 },
    { cle: 'abandoned', n: etat.abandoned, alerte: (etat.abandoned ?? 0) > 0 },
  ]
}
