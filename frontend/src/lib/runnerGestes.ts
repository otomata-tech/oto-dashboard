// Les GESTES de /automations (oto#205, lot 2) — qui peut quoi sur une campagne, ce qu'un
// formulaire de déclencheur envoie, et ce qu'un refus du serveur donne à lire. Sorti des
// composants pour être éprouvé.
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
import type { RunnerTrigger } from '@/api/console'
import { canAdministerOrg, canWriteInOrg } from '@/composables/useMe'
import type { Me, RunnerFleet, RunnerFleetState, RunnerModel } from '@/types/api'
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

type Porteur = Pick<Me, 'role' | 'org_role' | 'active_org_readonly' | 'view_as_read_only'> | null | undefined

/** La règle commune des écrans d'org (`useMe`, oto#211), projetée sur une campagne : arrêter
 * s'ouvre à tout membre hors consultation (`canWriteInOrg`) ; armer et relancer à l'admin
 * d'org tel que le serveur le tient — l'org_admin de l'org et le seul super_admin, jamais
 * l'`admin` plateforme que `launch` refuse (oto#210) —, hors consultation (`canAdministerOrg`). */
export function droits(me: Porteur): Droits {
  return { ouverts: canWriteInOrg(me), armer: canAdministerOrg(me) }
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

// ── Déclencheurs ─────────────────────────────────────────────────────────────────
// `runner.triggers` est ouvert à tout membre, sans garde admin ni bêta : l'écran ne garde
// rien de plus que le serveur servi. Seule la lecture seule masque les gestes.

/** Ce que le formulaire d'un déclencheur règle. `model: ''` = le modèle du worker. */
export interface ReglageDeclencheur {
  cron: string
  tz: string
  model: string
}

/** ⚠️ Un déclencheur sans modèle déclaré se règle sur `''` (« modèle du worker »), JAMAIS
 * sur le modèle `default` du catalogue : l'écrire changerait la famille qui sert l'agent. */
export function reglageInitial(t: Pick<RunnerTrigger, 'cron' | 'tz' | 'model'>): ReglageDeclencheur {
  // Un webhook n'a ni `cron` ni fuseau à régler : `''` des deux côtés, jamais envoyé.
  return { cron: t.cron ?? '', tz: t.tz ?? '', model: t.model ?? '' }
}

/** Les SEULS champs modifiés : `op=update` est partiel, et renvoyer un champ inchangé
 * n'est pas neutre — un `model` renvoyé tel quel sur un déclencheur allumé repasse la
 * garde du modèle servi. Un cron ne change pas par ses espaces de bord. */
export function champsModifies(
  initial: ReglageDeclencheur,
  saisi: ReglageDeclencheur,
): Partial<ReglageDeclencheur> {
  const champs: Partial<ReglageDeclencheur> = {}
  const cron = saisi.cron.trim()
  if (cron !== initial.cron.trim()) champs.cron = cron
  if (saisi.tz !== initial.tz) champs.tz = saisi.tz
  if (saisi.model !== initial.model) champs.model = saisi.model
  return champs
}

/** ⚠️ La ligne rendue par `op=update` est la ligne BRUTE : ni `expired_*`, ni `runner`, ni ce
 * qu'un webhook a reçu (`hook_url`, livraisons, file). Tout cela se garde de la lecture
 * précédente jusqu'à la relecture ; le reste — dont `next_due`, recalculé par le serveur —
 * vient de la réponse. */
export function apresReglage(courant: RunnerTrigger, rendu: Partial<RunnerTrigger>): RunnerTrigger {
  return {
    ...courant,
    ...rendu,
    expired_count: courant.expired_count,
    expired_since: courant.expired_since,
    expired_last: courant.expired_last,
    hook_url: courant.hook_url,
    deliveries_24h: courant.deliveries_24h,
    deliveries_refused_24h: courant.deliveries_refused_24h,
    last_delivery: courant.last_delivery,
    queue_pending: courant.queue_pending,
    queue_held: courant.queue_held,
  }
}

/** Les fuseaux que le navigateur connaît, le fuseau courant en tête s'il n'y figure pas
 * (`UTC` n'est pas listé partout). La validation reste au serveur. */
export function fuseauxProposes(courant: string): string[] {
  const connus = Intl.supportedValuesOf('timeZone')
  return connus.includes(courant) ? connus : [courant, ...connus]
}

type ModeleCatalogue = Pick<RunnerModel, 'id' | 'label' | 'served'>

/** Le modèle déclaré d'un déclencheur, dit avec le catalogue servi. `label: null` = aucun
 * modèle déclaré. `nonServi` ne se prononce que sur un catalogue LU : sans lui, on ne sait
 * pas, et on ne marque rien. */
export function modeleDeclencheur(
  model: string | null | undefined,
  catalogue: ModeleCatalogue[],
): { label: string | null; nonServi: boolean } {
  if (!model) return { label: null, nonServi: false }
  const connu = catalogue.find((m) => m.id === model)
  return { label: connu?.label ?? model, nonServi: catalogue.length > 0 && !connu?.served }
}

export interface OptionModele {
  value: string
  label: string
  nonServi: boolean
}

/** Les modèles SERVIS, dans l'ordre du catalogue — plus le modèle courant s'il ne l'est
 * pas, marqué : le taire ferait croire à un réglage qui n'existe pas. « Modèle du worker »
 * (`''`) n'y figure pas : c'est l'option vide du select. Le `default` du catalogue ne
 * change ni l'ordre ni la sélection. */
export function optionsModele(catalogue: ModeleCatalogue[], courant: string): OptionModele[] {
  const servis = catalogue.filter((m) => m.served)
    .map((m) => ({ value: m.id, label: m.label, nonServi: false }))
  if (!courant || servis.some((o) => o.value === courant)) return servis
  const { label, nonServi } = modeleDeclencheur(courant, catalogue)
  return [...servis, { value: courant, label: label ?? courant, nonServi }]
}
