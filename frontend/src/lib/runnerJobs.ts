// Lecture d'un travail du runner — l'arithmétique et le vocabulaire, hors des vues.
//
// Deux cartes (surveillance + file) et une fiche lisent le MÊME job : sans ce
// module, chacune réinventait sa conversion de date et son libellé, et deux
// écrans finissaient par ne plus dire la même chose du même travail.
//
// ⚠️ Ce que le backend garantit, et ce qu'il ne garantit pas. Le schéma servi
// (`JobResult`, capacité `runner.jobs`) NE NOMME que quatre champs —
// `usage_tokens`, `stopped`, `steps`, `tool_counts` — et se déclare `extra=allow` :
// tout le reste (`writes`, `claims`, `model`, les postes de garde…) est DÉCLARÉ
// PAR LE WORKER et traverse le schéma sans y être décrit. Conséquences tenues ici :
// rien n'est jamais supposé présent, et un champ inconnu n'est pas jeté — il tombe
// dans « autres », sous sa clé brute, plutôt que de disparaître de l'écran.
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

export function jetons(n: number | undefined | null): string | null {
  if (!n) return null
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

// ── Ce que le job vise (payload) ─────────────────────────────────────────────
// Le payload porte des RÉFÉRENCES par contrat d'enqueue (jamais un secret) ; sa
// forme est ouverte, on ne lit donc que ce qui s'y trouve.
function chaine(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

export function procOf(j: RunnerJob): string {
  return chaine(j.payload?.procedure)
    ?? (j.kind === 'continue' ? 'reprise de fil' : '—')
}
export function flotteOf(j: RunnerJob): string | null {
  return chaine(j.payload?.fleet)
}
export function tableauOf(j: RunnerJob): string | null {
  return chaine(j.payload?.namespace)
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

// ── Postes de garde ─────────────────────────────────────────────────────────
// Le signal qui ne doit jamais être noyé : un travail peut se conclure « terminé »
// alors que la garde a dû rattraper ce qu'il a écrit. Aucune erreur n'est levée
// dans ce cas — sans ces compteurs, la campagne paraît propre.
export interface Garde {
  cle: string
  label: string
  /** Une valeur perdue ne se rattrape pas : elle ne se range pas avec ce que la
   * garde a su corriger. */
  severe?: boolean
}
export const GARDES: Garde[] = [
  { cle: 'valeurs_cliente_reparees', label: 'valeurs client réparées' },
  { cle: 'contacts_fabriques_retires', label: 'contacts inventés retirés' },
  { cle: 'valeurs_cliente_detruites', label: 'valeurs client détruites', severe: true },
]

function entier(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

export function compteGarde(j: RunnerJob, cle: string): number {
  return entier((j.result as Record<string, unknown> | null)?.[cle])
}
/** Total des interventions de garde sur ce travail — 0 = la garde n'a rien eu à faire. */
export function totalGardes(j: RunnerJob): number {
  return GARDES.reduce((s, g) => s + compteGarde(j, g.cle), 0)
}
export function aUneGarde(j: RunnerJob): boolean {
  return totalGardes(j) > 0
}

// ── Le `result`, rendu lisible ──────────────────────────────────────────────
// Le contrat étant ouvert, on le lit en trois temps : les postes qu'on sait
// nommer, le relevé d'outils, puis TOUT LE RESTE sous sa clé brute. Le troisième
// temps n'est pas un filet de sécurité décoratif : c'est ce qui empêche un champ
// neuf déclaré par le worker de rester invisible en attendant qu'on y pense.
export type TonPoste = 'neutre' | 'attention' | 'alerte'

export interface PosteResultat {
  cle: string
  label: string
  valeur: string
  ton: TonPoste
}

/** Les clés lues à part : soit portées par un poste nommé, soit rendues ailleurs
 * (gardes, relevé d'outils) — elles ne doivent pas retomber dans « autres ». */
const NOMMEES = new Set<string>([
  'model', 'steps', 'stopped', 'claims', 'writes',
  'usage_tokens', 'usage_cache_read', 'usage_cache_write',
  'faux_depart', 'claim_vide', 'hors_schema',
  'tool_counts',
  ...GARDES.map((g) => g.cle),
])

// Motifs d'arrêt de la boucle, dits en clair. Une valeur inconnue se rend telle
// quelle : mieux vaut un mot anglais lisible qu'un mot français inventé.
const ARRETS: Record<string, string> = {
  end_turn: 'fin de tour',
  max_steps: 'plafond d’étapes atteint',
  max_tokens: 'plafond de jetons atteint',
  error: 'erreur',
  stop_sequence: 'séquence d’arrêt',
}

function liste(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []
}

/** Les postes nommés du résultat, dans l'ordre où on les lit devant un travail :
 * ce qu'il a fait, puis comment il s'est arrêté, puis ce qu'il a coûté. */
export function postesResultat(j: RunnerJob): PosteResultat[] {
  const r = j.result as Record<string, unknown> | null
  if (!r) return []
  const out: PosteResultat[] = []
  const pousse = (cle: string, label: string, valeur: string | null, ton: TonPoste = 'neutre') => {
    if (valeur !== null) out.push({ cle, label, valeur, ton })
  }

  const claims = entier(r.claims)
  const writes = entier(r.writes)
  pousse('claims', 'lignes réservées', claims ? String(claims) : null)
  pousse('writes', 'écritures', writes ? String(writes) : null)
  // Réservé puis conclu sans rien écrire : aucune erreur n'est levée, c'est le
  // seul endroit où le tour perdu se voit.
  if (r.faux_depart === true) {
    pousse('faux_depart', 'issue', 'réservé, rien écrit', 'attention')
  } else if (r.claim_vide === true) {
    pousse('claim_vide', 'issue', 'réservation à vide', 'attention')
  }

  const horsSchema = liste(r.hors_schema)
  pousse('hors_schema', 'colonnes hors schéma',
    horsSchema.length ? horsSchema.join(', ') : null, 'attention')

  pousse('steps', 'étapes', entier(r.steps) ? String(r.steps) : null)
  const stop = chaine(r.stopped)
  pousse('stopped', 'arrêt', stop ? (ARRETS[stop] ?? stop) : null,
    stop && stop !== 'end_turn' ? 'attention' : 'neutre')
  pousse('model', 'modèle', chaine(r.model))

  pousse('usage_tokens', 'jetons facturés', jetons(entier(r.usage_tokens)))
  pousse('usage_cache_read', 'jetons lus en cache', jetons(entier(r.usage_cache_read)))
  pousse('usage_cache_write', 'jetons écrits en cache', jetons(entier(r.usage_cache_write)))
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
 * brute plutôt que masqué. Le contrat est ouvert : un champ inconnu aujourd'hui
 * est un champ neuf, pas une anomalie. */
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
