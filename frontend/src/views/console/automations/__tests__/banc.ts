// Le banc des pages de l'espace Automatisations (oto#214), partagé par `espace*.spec.ts`.
//
// L'espace se monte comme la coque le monte : la vue d'espace est la racine, et reste montée
// d'une page à l'autre ; le routeur est bâti sur la MÊME liste de pages que le vrai
// (`PAGES_ESPACE`). Un nouveau montage à la même adresse est un rechargement.
//
// La file des exécutions est servie par un faux serveur qui REJOUE le contrat de
// `jobs op=list` (filtres, `ORDER BY id DESC`, curseur keyset, `total` sous le même filtre,
// plafond de 200) : un écran qui oublierait un filtre montrerait ce que le serveur rendrait,
// pas une forme figée.
import { createApp, h, nextTick } from 'vue'
import type { Mock } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ApiError } from '@/api'
import type {
  RunnerFleet, RunnerFleetState, RunnerJob, RunnerJobsFiltre, RunnerJobsPage, RunnerTrigger,
} from '@/api/console'
import { detailEspace, PAGES_ESPACE, SECTION } from '@/lib/automationsEspace'
import { i18n } from '@/lib/i18n'
// Import STATIQUE : le graphe de l'espace se charge à la collecte du fichier, pas dans le
// premier test — sous charge, un import à froid dans un test dépassait ses 5 s (13/09/2026).
// Les `vi.mock` des specs sont hissés avant les imports : ils s'appliquent quand même.
import Espace from '@/views/console/AutomationsView.vue'

export type Bouchons = Record<
  | 'listRunnerFleets' | 'getRunnerFleet' | 'getRunnerFleetState' | 'launchRunnerFleet' | 'stopRunnerFleet'
  | 'listRunnerJobs' | 'getRunnerJob' | 'listRunnerTriggers' | 'getRunnerTrigger' | 'updateRunnerTrigger'
  | 'deleteRunnerTrigger' | 'getConnectorInstances' | 'getRunThread' | 'getNamespaceQueue',
  Mock
>

export const ADMIN = { sub: 'a', role: 'member', org_role: 'org_admin' }
export const MEMBRE = { sub: 'm', role: 'member', org_role: 'org_member' }
// Un opérateur plateforme qui consulte une org sans en être membre.
export const LECTURE = { sub: 'o', role: 'admin', org_role: null, active_org_readonly: true }

export const vider = async () => {
  for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}

export const flotte = (over: Partial<RunnerFleet> = {}): RunnerFleet => ({
  id: 7, label: 'relance', procedure: 'relance-clients', namespace: 'clients', model: null,
  status: 'running', stop_reason: null, max_rows: null, armed_at: '2026-09-13 08:00:00',
  started_at: '2026-09-13 08:00:05', stopping_at: null, heartbeat_at: null, stopped_at: null,
  created_at: '2026-09-13 07:00:00', ...over,
} as RunnerFleet)

export const ETAT: RunnerFleetState = {
  jobs_total: 30, pending: 0, claimed: 3, done: 27, failed: 0, abandoned: 0,
  empty_jobs: 0, stopped_after_write: 0, reservation_unmeasured: 0, usage_tokens: 90_000,
  heaviest_row_tokens: 4_000, usage_unknown: 0, reservable_rows: 0, reservable_rows_unavailable: null,
  last_finished: '2026-09-13 11:58:00', no_jobs_attached: false,
}

export const programmation = (over: Partial<RunnerTrigger> = {}): RunnerTrigger => ({
  id: 3, procedure: 'veille', cron: '0 8 * * *', tz: 'Europe/Paris', tools: [], project_id: null,
  label: 'Veille du matin', enabled: true, next_due: '2026-09-14 06:00:00', max_steps: null,
  model: null, expired_count: 0, expired_since: null, expired_last: null, ...over,
})

export const RUNNER = { armed: true, workers: 1, last_seen: '2026-09-13 11:59:00', families: [], models: [] }

export const travail = (over: Partial<RunnerJob> = {}): RunnerJob => ({
  id: 1, kind: 'start', run_id: null, payload: null, status: 'done', attempts: 1, max_attempts: 3,
  claimed_by: null, last_error: null, result: null, due_at: null, created_at: '2026-09-13 09:00:00',
  finished_at: null, fleet_id: null, ...over,
})

/** Trente exécutions de la campagne 7, dix de la campagne 8, deux programmées, une directe. */
export const CAMPAGNE_7 = Array.from({ length: 30 }, (_, i) => 100 + i)
export const FILE: RunnerJob[] = [
  ...CAMPAGNE_7.map((id) => travail({ id, fleet_id: 7, status: 'done' })),
  ...Array.from({ length: 10 }, (_, i) => travail({ id: 200 + i, fleet_id: 8, status: 'failed' })),
  travail({ id: 300, payload: { trigger_id: 3, procedure: 'veille' }, status: 'done' }),
  travail({ id: 301, payload: { trigger_id: 4, procedure: 'autre' }, status: 'failed' }),
  travail({ id: 302, payload: { procedure: 'directe' }, status: 'done' }),
]

function sourceDe(j: RunnerJob): RunnerJobsFiltre['source'] {
  if (j.fleet_id != null) return 'batch'
  return j.payload?.trigger_id != null ? 'scheduled' : 'manual'
}

/** `jobs op=list` tel que le serveur le joue (`db/runner_jobs.py`). */
export function servirFile(population: RunnerJob[]) {
  return async (filtre: RunnerJobsFiltre, page: { limit: number; cursor?: string | null }): Promise<RunnerJobsPage> => {
    const sous = population
      .filter((j) => filtre.fleet_id === undefined || j.fleet_id === filtre.fleet_id)
      .filter((j) => filtre.trigger_id === undefined || String(j.payload?.trigger_id) === String(filtre.trigger_id))
      .filter((j) => filtre.status === undefined || j.status === filtre.status)
      .filter((j) => filtre.source === undefined || sourceDe(j) === filtre.source)
      .sort((a, b) => b.id - a.id)
    const limite = Math.max(1, Math.min(page.limit, 200))
    const avant = page.cursor ? Number(page.cursor) : Infinity
    const jobs = sous.filter((j) => j.id < avant).slice(0, limite)
    const dernier = jobs[jobs.length - 1]
    return { jobs, total: sous.length, next_cursor: dernier && jobs.length >= limite ? String(dernier.id) : null }
  }
}

export interface Monde {
  fleets?: RunnerFleet[]
  etat?: (f: RunnerFleet) => RunnerFleetState
  triggers?: RunnerTrigger[]
  file?: RunnerJob[]
}

/** Sert chaque contrat de l'espace depuis un monde cohérent : une lecture par id rend l'objet de
 * la liste, ou le 404 que le serveur rend. */
export function servirMonde(api: Bouchons, monde: Monde = {}) {
  const fleets = monde.fleets ?? [flotte()]
  const triggers = monde.triggers ?? [programmation()]
  const file = monde.file ?? FILE
  const campagne = (id: number) => {
    const f = fleets.find((x) => x.id === id)
    if (!f) throw new ApiError(404, 'fleet_not_found', 'inconnue dans cette org')
    return f
  }
  api.listRunnerFleets.mockImplementation(async () => ({ fleets }))
  api.getRunnerFleet.mockImplementation(async (id: number) => ({ fleet: campagne(id) }))
  api.getRunnerFleetState.mockImplementation(async (id: number) => {
    const f = campagne(id)
    return { fleet: f, state: (monde.etat ?? (() => ETAT))(f) }
  })
  api.listRunnerTriggers.mockImplementation(async () => ({ triggers, runner: RUNNER }))
  api.getRunnerTrigger.mockImplementation(async (id: number) => {
    const tr = triggers.find((x) => x.id === id)
    if (!tr) throw new ApiError(404, 'trigger_not_found', 'inconnue dans cette org')
    return { trigger: tr, runner: RUNNER }
  })
  // `op=update` est partiel et rend la ligne BRUTE, sans `expired_*` : le monde retient le
  // réglage, et une relecture le sert.
  api.updateRunnerTrigger.mockImplementation(async (id: number, champs: Partial<RunnerTrigger>) => {
    const tr = triggers.find((x) => x.id === id)
    if (!tr) throw new ApiError(404, 'trigger_not_found', 'inconnue dans cette org')
    Object.assign(tr, champs)
    return { trigger: { ...tr, expired_count: null, expired_since: null, expired_last: null } }
  })
  api.listRunnerJobs.mockImplementation(servirFile(file))
  api.getRunnerJob.mockImplementation(async (id: number) => {
    const job = file.find((x) => x.id === id)
    if (!job) throw new ApiError(404, 'job_not_found', 'inconnue dans cette org')
    return { job }
  })
  api.getConnectorInstances.mockResolvedValue({ instances: [] })
  api.getRunThread.mockResolvedValue({ run_id: 'r', messages: [] })
  api.getNamespaceQueue.mockResolvedValue({ rows: [] })
}

const VIDE = { render: () => null }

export function routeurEspace(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: SECTION, component: VIDE, meta: { section: SECTION } },
      ...PAGES_ESPACE.map((p) => ({
        path: p.path, component: VIDE, meta: { section: SECTION, detail: detailEspace(p.page) },
      })),
      { path: '/procedures/:id', component: VIDE },
      { path: '/connectors', component: VIDE },
      { path: '/data/:id', component: VIDE },
      { path: '/data/:id/item/:rowId', component: VIDE },
    ],
  })
}

export interface Monte { hote: HTMLElement; router: Router; demonter: () => void }

export async function monterEspace(url: string): Promise<Monte> {
  const router = routeurEspace()
  await router.push(url)
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const app = createApp({ render: () => h(Espace) })
  app.use(router)
  app.use(i18n)
  app.mount(hote)
  await vider()
  return { hote, router, demonter: () => { app.unmount(); hote.remove() } }
}

/** Un geste qui navigue, puis ce qui s'ensuit. */
export async function naviguer(router: Router, geste: () => unknown) {
  await new Promise<void>((fini) => {
    const retirer = router.afterEach(() => { retirer(); fini() })
    void geste()
  })
  await vider()
}

export const cliquer = async (el: Element | null | undefined) => {
  if (!el) throw new Error('élément absent : rien à cliquer')
  ;(el as HTMLElement).click()
  await vider()
}
