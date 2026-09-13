// L'ESPACE Automatisations (oto#214) : ses pages, ce que chaque adresse désigne, et ce que
// l'URL porte — filtres et lignes déroulées — pour que rechargement et retour navigateur
// retrouvent la même lecture.
//
// Le routeur n'a pas de routes enfants : chaque page est une route plate de section
// `/automations` (surlignage du menu, vue d'espace montée une fois), distinguée par
// `meta.detail`. Ce module en est la SEULE liste : le routeur, la barre du haut et les
// tests la lisent.
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { RunnerFleet, RunnerJob, RunnerJobsFiltre } from '@/api/console'
import { estVivante } from './runnerFleets'

export const SECTION = '/automations'

export type PageEspace =
  | 'accueil' | 'campagnes' | 'campagne' | 'programmations' | 'programmation'
  | 'reglages' | 'executions' | 'execution'

interface PageRoutee { page: Exclude<PageEspace, 'accueil'>; path: string; meta: string }

/** Les pages sous l'entrée. `meta` nomme leurs clés `pageMeta.*`. Les segments d'URL sont
 * anglais, comme tout le routeur (`/projects/:id`, `/data/:id/item/:rowId`). */
export const PAGES_ESPACE: readonly PageRoutee[] = [
  { page: 'campagnes', path: '/automations/campaigns', meta: 'automationsCampaigns' },
  { page: 'campagne', path: '/automations/campaigns/:id', meta: 'automationsCampaign' },
  { page: 'programmations', path: '/automations/schedules', meta: 'automationsSchedules' },
  { page: 'programmation', path: '/automations/schedules/:id', meta: 'automationsSchedule' },
  { page: 'reglages', path: '/automations/schedules/:id/settings', meta: 'automationsScheduleSettings' },
  { page: 'executions', path: '/automations/executions', meta: 'automationsExecutions' },
  { page: 'execution', path: '/automations/executions/:id', meta: 'automationsExecution' },
]

export const detailEspace = (page: PageEspace): string => `automations-${page}`

/** La page qu'une route désigne ; l'entrée pour toute autre valeur de `meta.detail`. */
export function pageDe(detail: unknown): PageEspace {
  return PAGES_ESPACE.find((p) => detailEspace(p.page) === detail)?.page ?? 'accueil'
}

/** Titre et fil de la barre du haut, par `meta.detail` : une page absente retomberait en
 * silence sur le titre de l'aperçu. */
export const META_ESPACE: Record<string, { title: string; crumb: string }> = Object.fromEntries(
  PAGES_ESPACE.map((p) => [
    detailEspace(p.page),
    { title: `pageMeta.${p.meta}.title`, crumb: `pageMeta.${p.meta}.crumb` },
  ]),
)

// ── La navigation de l'espace ───────────────────────────────────────────────
export type Rubrique = 'campagnes' | 'programmations' | 'executions'

export const RUBRIQUES: ReadonlyArray<{ cle: Rubrique; path: string; label: string }> = [
  { cle: 'campagnes', path: '/automations/campaigns', label: 'automations.space.nav.campaigns' },
  { cle: 'programmations', path: '/automations/schedules', label: 'automations.space.nav.schedules' },
  { cle: 'executions', path: '/automations/executions', label: 'automations.space.nav.executions' },
]

const RUBRIQUE_DE: Record<PageEspace, Rubrique | null> = {
  accueil: null,
  campagnes: 'campagnes', campagne: 'campagnes',
  programmations: 'programmations', programmation: 'programmations', reglages: 'programmations',
  executions: 'executions', execution: 'executions',
}
export const rubriqueDe = (page: PageEspace): Rubrique | null => RUBRIQUE_DE[page]

export interface Maillon { label: string; params: Record<string, string>; to: string | null }

/** Le fil d'Ariane d'une page : chaque maillon mène à sa page, sauf le dernier. L'objet se
 * nomme par l'identifiant de son adresse — la page, elle, affiche son nom. */
export function filDAriane(page: PageEspace, id: string | null): Maillon[] {
  const m = (label: string, to: string | null, params: Record<string, string> = {}): Maillon =>
    ({ label, params, to })
  const rubrique = RUBRIQUES.find((r) => r.cle === rubriqueDe(page))
  if (!rubrique) return [m('automations.space.root', null)]
  const racine = m('automations.space.root', SECTION)
  if (page === rubrique.cle) return [racine, m(rubrique.label, null)]
  const objet = { id: id ?? '' }
  if (page !== 'reglages') return [racine, m(rubrique.label, rubrique.path), m('automations.space.crumbId', null, objet)]
  return [
    racine, m(rubrique.label, rubrique.path),
    m('automations.space.crumbId', `${rubrique.path}/${id ?? ''}`, objet),
    m('automations.space.settings', null),
  ]
}

// ── Ce qu'une adresse porte ─────────────────────────────────────────────────
/** L'identifiant qu'une adresse porte, ou `null` si ce n'est pas un entier positif : l'écran
 * le dit alors sans rien demander au serveur. */
export function idDAdresse(raw: unknown): number | null {
  return typeof raw === 'string' && /^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : null
}

const un = (v: LocationQuery[string] | undefined): string | null =>
  (typeof v === 'string' && v !== '' ? v : null)

/** Une lecture de l'URL, et ce qu'elle n'a pas su lire : un filtre inconnu se DIT ignoré. */
export interface LectureUrl<T> { valeur: T; ignores: string[] }

export const SOURCES_EXECUTION = ['batch', 'scheduled', 'manual'] as const
export const STATUTS_EXECUTION = ['pending', 'claimed', 'done', 'failed'] as const
export type ChampFiltre = 'source' | 'status' | 'campaign'

/** Les filtres SERVIS de la liste des exécutions, lus dans la query. Aucun n'est reconstruit
 * côté client. `expired` n'est pas un filtre servi : il se dit ignoré. */
export function filtresExecutions(q: LocationQuery): LectureUrl<RunnerJobsFiltre> {
  const valeur: RunnerJobsFiltre = {}
  const ignores: string[] = []
  const source = un(q.source)
  if (source !== null) {
    const s = SOURCES_EXECUTION.find((x) => x === source)
    if (s) valeur.source = s
    else ignores.push(`source=${source}`)
  }
  const statut = un(q.status)
  if (statut !== null) {
    const s = STATUTS_EXECUTION.find((x) => x === statut)
    if (s) valeur.status = s
    else ignores.push(`status=${statut}`)
  }
  const campagne = un(q.campaign)
  if (campagne !== null) {
    const id = idDAdresse(campagne)
    if (id !== null) valeur.fleet_id = id
    else ignores.push(`campaign=${campagne}`)
  }
  return { valeur, ignores }
}

/** La query après un changement de filtre : ce qui était déroulé ne vaut plus pour lui. */
export function queryAvecFiltre(q: LocationQuery, champ: ChampFiltre, valeur: string): LocationQueryRaw {
  const out: LocationQueryRaw = { ...q }
  delete out.shown
  if (valeur) out[champ] = valeur
  else delete out[champ]
  return out
}

export const TAILLE_PAGE = 25

/** Combien de lignes l'URL dit avoir déroulé (`?shown=`) ; `null` sans valeur lisible. */
export function affichesDeQuery(q: LocationQuery): number | null {
  return idDAdresse(un(q.shown))
}

// ── Les campagnes ───────────────────────────────────────────────────────────
export const FILTRES_CAMPAGNE = ['live', 'stopped', 'draft'] as const
export type FiltreCampagne = (typeof FILTRES_CAMPAGNE)[number]

export function filtreCampagnes(q: LocationQuery): LectureUrl<FiltreCampagne | null> {
  const brut = un(q.status)
  if (brut === null) return { valeur: null, ignores: [] }
  const f = FILTRES_CAMPAGNE.find((x) => x === brut)
  return f ? { valeur: f, ignores: [] } : { valeur: null, ignores: [`status=${brut}`] }
}

/** `fleets op=list` rend TOUTES les campagnes de l'org (aucune pagination servie) : ce filtre
 * s'applique à la liste complète, jamais à une fenêtre. */
export function garderCampagne(f: Pick<RunnerFleet, 'status'>, filtre: FiltreCampagne | null): boolean {
  if (filtre === null) return true
  return filtre === 'live' ? estVivante(f) : f.status === filtre
}

// ── Les programmations ──────────────────────────────────────────────────────
/** Le nom d'une programmation : son libellé, à défaut la procédure qu'elle lance. */
export function nomProgrammation(t: { label: string | null; procedure: string }): string {
  return t.label || t.procedure
}

// ── L'historique d'un objet ─────────────────────────────────────────────────
/** Le filtre SERVEUR de l'historique d'un objet. ⚠️ Sans lui, la page lirait toute la file
 * de l'org sous le nom de la campagne ou de la programmation. */
export function historiqueDe(objet: 'campagne' | 'programmation', id: number): RunnerJobsFiltre {
  return objet === 'campagne' ? { fleet_id: id } : { trigger_id: id }
}

/** La programmation qui a enfilé une exécution : le tick pose `trigger_id` dans la charge
 * utile, que le serveur compare en texte. `null` quand elle ne la nomme pas. */
export function programmationDe(j: Pick<RunnerJob, 'payload'>): number | null {
  const v = j.payload?.trigger_id
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? v : null
  return idDAdresse(v)
}
