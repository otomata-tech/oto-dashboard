// Les GESTES de /automations (oto#205, lot 2) — qui peut quoi sur une campagne, et ce
// qu'un refus du serveur donne à lire. Sorti des composants pour être éprouvé.
//
// Règles confirmées par la session flotte sur le tronc (13/09/2026) :
//   • Armer et Relancer ne s'affichent qu'à un admin d'org — jamais grisés pour un
//     membre ; Arrêter est ouvert à tout membre ;
//   • en consultation en lecture seule, aucun geste : le serveur refuse toute mutation ;
//   • Armer part d'un `draft` dont `op=state` a été LU — sans lui, brouillon et historique
//     se confondent ; Relancer part de `stopped`, `done` ou `failed` ;
//   • aucun geste sur `stopping`, ni sur une campagne historique ;
//   • pas de Relancer quand la relance ne produirait rien (R1, R2), jusqu'au correctif
//     backend (compter depuis `armed_at`) — le levier nommé est toujours « déclarer une
//     nouvelle campagne », jamais « augmenter la borne ».
import { ApiError } from '@/api'
import { isSuperAdmin } from '@/composables/useMe'
import type { Me, RunnerFleet, RunnerFleetState } from '@/types/api'
import { explain } from './errors'

export type GesteCampagne = 'armer' | 'relancer' | 'arreter'

/** Pourquoi une campagne qu'on pourrait vouloir relancer ne l'est pas. */
export type Empechement = 'historique' | 'borneAtteinte' | 'echecsConsecutifs'

/** Durée d'observation après un geste réussi : un armement se constate en secondes (un
 * worker sonde), un arrêt attend la fin des travaux en vol. */
export const FENETRE_OBSERVATION_MS: Record<GesteCampagne, number> = {
  armer: 60_000,
  relancer: 60_000,
  arreter: 120_000,
}

/** R2 — le motif que le serveur ÉCRIT quand il arrête une campagne pour échecs
 * consécutifs. C'est une constante, pas une phrase : `arreter_campagnes_epuisees`
 * (oto-backend, `oto_mcp/db/runner_fleets.py`) pose
 * `stop_reason = 'max_consecutive_failures'`. On ne lit rien d'autre dans le motif. */
export const MOTIF_ECHECS_CONSECUTIFS = 'max_consecutive_failures'

export interface Droits {
  /** Des gestes s'offrent-ils ? Faux en consultation en lecture seule. */
  ouverts: boolean
  /** Armer et relancer. */
  armer: boolean
}

type Porteur = Pick<Me, 'role' | 'org_role' | 'active_org_readonly'> | null | undefined

/** ⚠️ PAS `isOrgAdmin` (useMe) : il compte l'`admin` plateforme, que `launch` refuse. Le
 * serveur (`roles.is_org_admin`) tient pour admin d'org l'org_admin de l'org et le seul
 * super_admin (défaut voisin : oto#210). */
export function droits(me: Porteur): Droits {
  const ouverts = !!me && me.active_org_readonly !== true
  return { ouverts, armer: ouverts && (me?.org_role === 'org_admin' || isSuperAdmin(me)) }
}

export interface GestesPermis {
  gestes: GesteCampagne[]
  /** Dit seulement à qui aurait eu le geste : un membre n'a rien à apprendre d'un geste
   * qui ne lui est pas offert. */
  empechement: Empechement | null
}

const AUCUN: GestesPermis = { gestes: [], empechement: null }
const seul = (g: GesteCampagne): GestesPermis => ({ gestes: [g], empechement: null })
const empeche = (e: Empechement): GestesPermis => ({ gestes: [], empechement: e })

export function gestesCampagne(
  f: Pick<RunnerFleet, 'status' | 'stop_reason' | 'max_rows'>,
  etat: RunnerFleetState | null,
  d: Droits,
): GestesPermis {
  if (!d.ouverts) return AUCUN
  switch (f.status) {
    case 'armed':
    case 'running':
      return seul('arreter')
    case 'draft':
      if (!d.armer || !etat) return AUCUN
      return etat.no_jobs_attached ? seul('armer') : empeche('historique')
    case 'stopped':
    case 'done':
    case 'failed':
      if (!d.armer || !etat) return AUCUN
      // R2 : `arreter_campagnes_epuisees` lit la série d'échecs sans borne d'armement —
      // relancée, la campagne serait ré-arrêtée au premier sondage sans rien produire.
      if (f.stop_reason === MOTIF_ECHECS_CONSECUTIFS) return empeche('echecsConsecutifs')
      // R1 : relancée, elle resterait `armed` pour toujours.
      if (borneAtteinte(f, etat)) return empeche('borneAtteinte')
      return seul('relancer')
    // `stopping` : l'arrêt est demandé, il n'y a qu'à l'attendre. Statut inconnu : rien
    // ne s'offre sur un état qu'on ne sait pas dire.
    default:
      return AUCUN
  }
}

/** R1 — `campagne_a_servir` compare `max_rows` au compte de TOUS les travaux de la
 * campagne, tout statut et tout armement confondus : exactement `jobs_total` de
 * `op=state` (`COUNT(*) … WHERE fleet_id`). */
export function borneAtteinte(
  f: Pick<RunnerFleet, 'max_rows'>,
  etat: Pick<RunnerFleetState, 'jobs_total'>,
): boolean {
  return typeof f.max_rows === 'number' && etat.jobs_total >= f.max_rows
}

/** Une lecture de la liste partie AVANT qu'une carte n'écrive une campagne ne remplace
 * pas cette campagne : elle rendrait un état plus ancien que celui qu'on affiche. Tout le
 * reste — les autres campagnes, l'ordre, les apparitions, les disparitions — vient de la
 * lecture. */
export function fusionnerLecture(
  affichees: RunnerFleet[],
  lues: RunnerFleet[],
  ecriteApresLecture: (id: number) => boolean,
): RunnerFleet[] {
  const parId = new Map(affichees.map((f) => [f.id, f]))
  return lues.map((f) => (ecriteApresLecture(f.id) ? (parId.get(f.id) ?? f) : f))
}

export interface Refus {
  /** Le code servi (`not_launchable`…) ; `null` sans réponse du serveur (réseau). */
  code: string | null
  /** Le `detail` rédigé par le serveur, mot pour mot ; à défaut, la traduction du code. */
  texte: string
}

export function refusServi(e: unknown): Refus {
  return { code: e instanceof ApiError ? e.code : null, texte: explain(e) }
}
