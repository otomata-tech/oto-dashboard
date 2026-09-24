// Lecture d'un travail du runner — l'arithmétique et le vocabulaire, hors des vues.
//
// Les listes de travaux (d'une campagne, hors campagne) et la fiche lisent le MÊME
// job : sans ce module, chacune réinventait sa conversion de date et son libellé, et
// deux écrans finissaient par ne plus dire la même chose du même travail.
//
// ⚠️ Ce que le backend garantit, et ce qu'il ne garantit pas. Le schéma servi
// (`JobResult`, capacité `runner.jobs`) nomme un socle — `usage_tokens`, `stopped`,
// `steps`, `tool_counts` — et se déclare `extra=allow` : tout le reste (`model`,
// `usage_cache_*`…) est DÉCLARÉ PAR LE WORKER et traverse le schéma sans y être
// décrit. Conséquences tenues ici : rien n'est jamais supposé présent, et un champ
// inconnu n'est pas jeté — il tombe dans « autres », sous sa clé brute.
//
// Retiré le 13/09/2026 (oto#205) : la lecture des postes de garde et des compteurs
// de réservation (`claims`, `writes`, `faux_depart`…). Le runner ne les écrit plus
// depuis le 01/09 ; les lire fabriquait un zéro qui avait l'air d'un succès. Sur un
// travail ancien qui les porte encore, ils retombent dans « autres », sous leur clé.
import type { RunnerJob } from '@/api/console'

// ── Temps ───────────────────────────────────────────────────────────────────
// ⚠️ Les horodatages arrivent en UTC SANS fuseau (« 2026-08-28 13:53:53 »).
// `Date.parse` les lirait comme heure LOCALE : un job de l'instant s'afficherait
// « il y a 2 h » l'été. On force le fuseau avant de parser.
export function instant(v: unknown): number | null {
  if (!v) return null
  const s = String(v)
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : s.replace(' ', 'T') + 'Z'
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function duree(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

/** Un écart dans le passé, dit par une clé i18n (`automations.time.*`) et son nombre.
 * Un instant FUTUR (horloges décalées) se dit « à l'instant » plutôt qu'en négatif. */
export function ecart(depuisMs: number): { cle: 'now' | 'minutes' | 'hours' | 'days'; n: number } {
  const min = Math.floor(Math.max(0, depuisMs) / 60_000)
  if (min < 1) return { cle: 'now', n: 0 }
  if (min < 60) return { cle: 'minutes', n: min }
  const h = Math.floor(min / 60)
  if (h < 24) return { cle: 'hours', n: h }
  return { cle: 'days', n: Math.floor(h / 24) }
}

/** Le séjour du travail : depuis combien de temps il tourne, ou combien il a duré.
 * Un job non conclu se mesure jusqu'à `maintenant` — c'est ce qui fait voir un
 * agent bloqué, là où une durée figée au chargement le masquerait. */
export function sejourMs(j: RunnerJob, maintenant: number): number | null {
  const debut = instant(j.created_at)
  if (debut === null) return null
  const fin = instant(j.finished_at) ?? maintenant
  return Math.max(0, fin - debut)
}

export function sejour(j: RunnerJob, maintenant: number): string | null {
  const ms = sejourMs(j, maintenant)
  return ms === null ? null : duree(ms)
}

/** Des jetons, lisibles, et JAMAIS convertis en monnaie. L'absence rend `null`, pas
 * `"0"` : on n'écrit pas un zéro là où on ne sait pas. Un vrai zéro, lui, s'écrit. */
export function jetons(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`
  return String(n)
}

// ── Le statut d'un travail ──────────────────────────────────────────────────
export type Ton = 'olive' | 'saffron' | 'terra' | 'cobalt' | 'ink'

const STATUTS_TRAVAIL: Record<string, Ton> = {
  pending: 'saffron', claimed: 'cobalt', done: 'olive', failed: 'terra',
  // Retenu par la pause de sa programmation webhook : il partira quand on la rallume.
  held: 'ink',
  abandoned: 'terra',
  // ⚠️ `expired` n'est pas `failed` : personne n'est venu le prendre, il n'a jamais
  // tourné. Le peindre en échec enverrait chercher une erreur d'exécution qui
  // n'existe pas.
  expired: 'ink',
}

export interface LibelleStatut {
  /** Clé i18n complète. */
  cle: string
  params: Record<string, string | number>
  ton: Ton
}

/** Le libellé d'un statut de travail. Un statut que cet écran ne connaît pas se
 * montre TEL QUEL, sous une clé qui le dit inconnu — jamais rangé sous un voisin. */
export function libelleTravail(status: string | null | undefined): LibelleStatut {
  const s = status ?? ''
  if (s in STATUTS_TRAVAIL) {
    return { cle: `automations.jobs.status.${s}`, params: {}, ton: STATUTS_TRAVAIL[s]! }
  }
  return { cle: 'automations.jobs.status.unknown', params: { status: s || '—' }, ton: 'saffron' }
}

/** Conclu : plus rien ne changera ce travail. C'est seulement là qu'un coût absent
 * mérite d'être dit « inconnu » dans une liste — sur un travail en file ou en vol,
 * il est inconnu par nature. */
export function estConclu(j: RunnerJob): boolean {
  return j.status === 'done' || j.status === 'failed' || j.status === 'expired'
    || j.status === 'abandoned'
}

// ── Le coût ─────────────────────────────────────────────────────────────────
/** `usage_tokens` = entrée hors cache + sortie, déclaré par le worker.
 * ⚠️ Un travail SANS résultat, ou dont le résultat ne déclare pas de jetons, a un
 * coût INCONNU — jamais 0 : un zéro se lirait « gratuit ». */
export type Cout = { etat: 'connu'; jetons: number } | { etat: 'inconnu' }

export function coutTravail(j: RunnerJob): Cout {
  const n = (j.result as Record<string, unknown> | null)?.usage_tokens
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
    ? { etat: 'connu', jetons: n }
    : { etat: 'inconnu' }
}

/** Le modèle que le worker DÉCLARE avoir fait tourner. `null` = non déclaré, ce que
 * l'écran dit en toutes lettres plutôt que de laisser une case vide. */
export function modeleTravail(j: RunnerJob): string | null {
  const m = (j.result as Record<string, unknown> | null)?.model
  return typeof m === 'string' && m ? m : null
}

// ── Ce que le job vise (payload) ─────────────────────────────────────────────
// Le payload porte des RÉFÉRENCES par contrat d'enqueue (jamais un secret) ; sa
// forme est ouverte, on ne lit donc que ce qui s'y trouve.
function chaine(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

/** La procédure, ou `null` quand le payload ne la nomme pas (reprise de fil…). */
export function procOf(j: RunnerJob): string | null {
  return chaine(j.payload?.procedure)
}

// ── Renvois du harnais ──────────────────────────────────────────────────────
// `attempts` s'incrémente à CHAQUE prise (claim), reprise d'un bail mort comprise :
// une prise est normale, les suivantes sont des renvois. Deux causes, qui ne se
// soignent pas pareil — d'où `renvoiMuet` :
//   • conclusion en échec → le job repart avec son motif dans `last_error` ;
//   • bail expiré → le worker est mort en cours de route, personne n'a rien écrit.
export function renvois(j: RunnerJob): number {
  return Math.max(0, (j.attempts ?? 0) - 1)
}
/** Renvoyé sans motif : le travail a été repris sans qu'aucun échec soit déclaré —
 * signature d'un worker mort en cours de bail. */
export function renvoiMuet(j: RunnerJob): boolean {
  return renvois(j) > 0 && !j.last_error
}

function entier(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

// ── Le bail du travail ──────────────────────────────────────────────────────
// `lease_until` dit quand expire la prise EN COURS.
//
// ⚠️ IL NE SE LIT JAMAIS SEUL. C'est le croisement avec `status` qui lui donne son
// sens, et le lire seul produit le contresens que ce module existe pour éviter :
//
//   `claimed`, date à venir   le bail court — l'agent est vivant
//   `claimed`, date passée    EXPIRÉ — le worker est parti, le job est re-claimable
//   conclu, date passée       le bail qui ÉTAIT tenu. Vrai, simplement PASSÉ :
//                             l'afficher « expiré » accuserait un travail terminé
//   pas de date               la prise n'a jamais eu lieu, ou a été rendue
export type EtatBail = 'aucun' | 'en-cours' | 'expire' | 'tenu'

export interface Bail {
  etat: EtatBail
  /** L'instant de fin, quand il y en a un. */
  fin: number | null
  /** Signé : positif = il reste du bail, négatif = il est dépassé de tant.
   * `null` hors d'un bail en cours. */
  resteMs: number | null
}

export function bail(j: RunnerJob, maintenant: number): Bail {
  const fin = instant(j.lease_until)
  if (fin === null) return { etat: 'aucun', fin: null, resteMs: null }
  if (j.status !== 'claimed') return { etat: 'tenu', fin, resteMs: null }
  const reste = fin - maintenant
  return { etat: reste >= 0 ? 'en-cours' : 'expire', fin, resteMs: reste }
}

/** Le seul cas où « expiré » se dit : une prise en cours dont le bail est dépassé. */
export function bailExpire(j: RunnerJob, maintenant: number): boolean {
  return bail(j, maintenant).etat === 'expire'
}

// ── Le `result`, rendu lisible ──────────────────────────────────────────────
// Le contrat étant ouvert, on le lit en trois temps : les postes qu'on sait
// nommer, le relevé d'outils, puis TOUT LE RESTE sous sa clé brute. Le troisième
// temps empêche un champ neuf déclaré par le worker de rester invisible.
export type TonPoste = 'neutre' | 'attention'

export interface PosteResultat {
  cle: string
  /** Clé i18n du libellé. */
  label: string
  /** La valeur brute à afficher ; `valeurCle` la remplace quand elle se traduit. */
  valeur: string
  valeurCle?: string
  ton: TonPoste
}

/** Les clés lues à part : portées par un poste nommé, ou rendues ailleurs (modèle et
 * coût dans l'identité du travail, relevé d'outils) — elles ne retombent pas dans
 * « autres ». */
const NOMMEES = new Set<string>([
  'model', 'steps', 'stopped', 'usage_tokens', 'usage_input', 'usage_output',
  'usage_cache_read', 'usage_cache_write', 'tool_counts',
])

// Motifs d'arrêt de la boucle qu'on sait dire. Une valeur inconnue se rend telle
// quelle : mieux vaut un mot anglais lisible qu'un mot français inventé.
const ARRETS = new Set(['end_turn', 'max_steps', 'max_tokens', 'error', 'stop_sequence'])

/** Les postes nommés du résultat : comment il s'est arrêté, puis le détail du coût
 * (le total `usage_tokens` et le modèle vivent dans l'identité du travail). */
export function postesResultat(j: RunnerJob): PosteResultat[] {
  const r = j.result as Record<string, unknown> | null
  if (!r) return []
  const out: PosteResultat[] = []
  const P = 'automations.job.result.'

  if (entier(r.steps)) out.push({ cle: 'steps', label: `${P}steps`, valeur: String(r.steps), ton: 'neutre' })
  const stop = chaine(r.stopped)
  if (stop) {
    out.push({
      cle: 'stopped', label: `${P}stopped`, valeur: stop,
      valeurCle: ARRETS.has(stop) ? `automations.job.stop.${stop}` : undefined,
      ton: stop !== 'end_turn' ? 'attention' : 'neutre',
    })
  }
  // Entrée et sortie séparées, cache à part : un tour cher en sortie et un tour cher
  // en entrée ne se corrigent pas de la même façon, et le cache lu n'est pas facturé
  // comme le reste.
  for (const [cle, label] of [
    ['usage_input', 'input'], ['usage_output', 'output'],
    ['usage_cache_read', 'cacheRead'], ['usage_cache_write', 'cacheWrite'],
  ] as const) {
    const v = jetons(entier(r[cle]) || null)
    if (v !== null) out.push({ cle, label: `${P}${label}`, valeur: v, ton: 'neutre' })
  }
  return out
}

/** Le relevé d'outils — les appels RÉUSSIS par outil, du plus utilisé au moins. */
export function outilsResultat(j: RunnerJob): Array<{ outil: string; n: number }> {
  const tc = (j.result as Record<string, unknown> | null)?.tool_counts
  if (!tc || typeof tc !== 'object') return []
  return Object.entries(tc as Record<string, unknown>)
    .map(([outil, n]) => ({ outil, n: entier(n) }))
    .filter((e) => e.n > 0)
    .sort((a, b) => b.n - a.n)
}

/** Ce que le worker a déclaré et qu'on ne sait pas nommer — rendu sous sa clé
 * brute plutôt que masqué. */
export function autresResultat(j: RunnerJob): Array<{ cle: string; valeur: string }> {
  const r = j.result as Record<string, unknown> | null
  if (!r) return []
  return Object.entries(r)
    .filter(([cle, v]) => !NOMMEES.has(cle) && v !== null && v !== undefined && v !== false)
    .map(([cle, v]) => ({
      cle,
      valeur: typeof v === 'object' ? JSON.stringify(v) : String(v),
    }))
}
