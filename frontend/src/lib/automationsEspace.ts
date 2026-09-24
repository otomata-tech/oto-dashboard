// L'ESPACE Automatisations (oto#214) : ses pages, ce que chaque adresse désigne, et ce que
// l'URL porte — filtres et lignes déroulées — pour que rechargement et retour navigateur
// retrouvent la même lecture.
//
// Le routeur n'a pas de routes enfants : chaque page est une route plate de section
// `/automations` (surlignage du menu, vue d'espace montée une fois), distinguée par
// `meta.detail`. Ce module en est la SEULE liste : le routeur, la barre du haut et les
// tests la lisent.
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { RunnerJob, RunnerJobsFiltre } from '@/api/console'

export const SECTION = '/automations'

export type PageEspace =
  | 'accueil' | 'campagne' | 'programmation' | 'reglages' | 'executions' | 'execution'

interface PageRoutee { page: Exclude<PageEspace, 'accueil'>; path: string; meta: string }

/** Les pages sous l'entrée. `meta` nomme leurs clés `pageMeta.*`. Les segments d'URL sont
 * anglais, comme tout le routeur (`/projects/:id`, `/data/:id/item/:rowId`). Les anciennes
 * listes `/automations/campaigns` et `/automations/schedules` sont des redirections vers
 * l'entrée (`ANCIENNES_LISTES`) : campagnes et programmations y forment une seule liste. */
export const PAGES_ESPACE: readonly PageRoutee[] = [
  { page: 'campagne', path: '/automations/campaigns/:id', meta: 'automationsCampaign' },
  { page: 'programmation', path: '/automations/schedules/:id', meta: 'automationsSchedule' },
  { page: 'reglages', path: '/automations/schedules/:id/settings', meta: 'automationsScheduleSettings' },
  { page: 'executions', path: '/automations/executions', meta: 'automationsExecutions' },
  { page: 'execution', path: '/automations/executions/:id', meta: 'automationsExecution' },
]

/** Les adresses publiées des anciennes listes, redirigées vers l'entrée (24/09/2026). */
export const ANCIENNES_LISTES = ['/automations/campaigns', '/automations/schedules'] as const

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
// Deux rubriques (24/09/2026, décision d'Alexis inspirée de Tulina) : les automatisations —
// programmations et campagnes, une seule liste sur l'entrée — et leurs exécutions.
export type Rubrique = 'automatisations' | 'executions'

export const RUBRIQUES: ReadonlyArray<{ cle: Rubrique; path: string; label: string }> = [
  { cle: 'automatisations', path: SECTION, label: 'automations.space.root' },
  { cle: 'executions', path: '/automations/executions', label: 'automations.space.nav.executions' },
]

const RUBRIQUE_DE: Record<PageEspace, Rubrique> = {
  accueil: 'automatisations', campagne: 'automatisations', programmation: 'automatisations',
  reglages: 'automatisations', executions: 'executions', execution: 'executions',
}
export const rubriqueDe = (page: PageEspace): Rubrique => RUBRIQUE_DE[page]

export interface Maillon { label: string; params: Record<string, string>; to: string | null }

/** Le fil d'Ariane d'une page : chaque maillon mène à sa page, sauf le dernier. L'objet se
 * nomme par l'identifiant de son adresse — la page, elle, affiche son nom. La rubrique des
 * automatisations EST la racine : elle n'y apparaît qu'une fois. */
export function filDAriane(page: PageEspace, id: string | null): Maillon[] {
  const m = (label: string, to: string | null, params: Record<string, string> = {}): Maillon =>
    ({ label, params, to })
  const racine = m('automations.space.root', SECTION)
  const objet = m('automations.space.crumbId', null, { id: id ?? '' })
  const executions = 'automations.space.nav.executions'
  switch (page) {
    case 'accueil': return [m('automations.space.root', null)]
    case 'campagne': case 'programmation': return [racine, objet]
    case 'reglages':
      return [racine, { ...objet, to: `/automations/schedules/${id ?? ''}` }, m('automations.space.settings', null)]
    case 'executions': return [racine, m(executions, null)]
    case 'execution': return [racine, m(executions, '/automations/executions'), objet]
  }
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
export type ChampFiltre = 'source' | 'status' | 'campaign' | 'schedule'

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
  const programmation = un(q.schedule)
  if (programmation !== null) {
    const id = idDAdresse(programmation)
    if (id !== null) valeur.trigger_id = id
    else ignores.push(`schedule=${programmation}`)
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

// ── Les programmations ──────────────────────────────────────────────────────
/** Le nom d'une programmation : son libellé, à défaut la procédure qu'elle lance. */
export function nomProgrammation(t: { label: string | null; procedure: string }): string {
  return t.label || t.procedure
}

/** Une programmation webhook part quand sa source livre, pas à une heure : elle n'a ni
 * `cron` ni prochaine exécution, et se lit par ses livraisons. Sans `kind`, c'est un horaire. */
export function estWebhook(t: { kind?: string | null }): boolean {
  return t.kind === 'webhook'
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
