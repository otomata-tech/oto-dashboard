// /automations, lot 1 d'oto#205 : la LECTURE juste. Ces montages tiennent ce que les
// fonctions pures ne peuvent pas prouver seules — ce que l'écran affiche d'une réponse
// servie, et ce qu'il fait d'une erreur.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, nextTick, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/lib/i18n'
import { ApiError } from '@/api'
import type { RunnerFleet, RunnerFleetState, RunnerJob } from '@/api/console'

const api = vi.hoisted(() => ({
  listRunnerFleets: vi.fn(), getRunnerFleetState: vi.fn(), listRunnerJobs: vi.fn(),
  launchRunnerFleet: vi.fn(), stopRunnerFleet: vi.fn(),
  listRunnerTriggers: vi.fn(), updateRunnerTrigger: vi.fn(), deleteRunnerTrigger: vi.fn(),
  getConnectorInstances: vi.fn(),
  getRunThread: vi.fn(), getNamespaceQueue: vi.fn(),
}))
vi.mock('@/api/console', () => api)
// Les helpers de rôle sont les VRAIS (oto#210) : seul le profil est un bouchon.
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me: { value: { sub: 'moi' } } }),
}))

const vider = async () => {
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}

async function monter(C: Component, props: Record<string, unknown> = {}) {
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/automations', component: { render: () => null } }] })
  await router.push('/automations')
  const app = createApp(C, props)
  app.use(router)
  app.use(i18n)
  app.component('RouterLink', { props: ['to'], template: '<a :href="to"><slot /></a>' })
  app.mount(hote)
  await vider()
  return hote
}

const flotte = (over: Partial<RunnerFleet>): RunnerFleet => ({
  id: 7, label: 'relance', procedure: 'relance-clients', namespace: 'clients', model: null,
  status: 'running', stop_reason: null, armed_at: null, started_at: '2026-09-13 08:00:00',
  stopping_at: null, heartbeat_at: null, stopped_at: null, created_at: '2026-09-13 07:00:00',
  ...over,
} as RunnerFleet)

const ETAT: RunnerFleetState = {
  jobs_total: 1840, pending: 12, claimed: 3, done: 1790, failed: 35, abandoned: 4,
  usage_tokens: 5_400_000, heaviest_row_tokens: 21_000, last_finished: '2026-09-13 09:12:00',
  no_jobs_attached: false,
}

const travail = (over: Partial<RunnerJob>): RunnerJob => ({
  id: 1, kind: 'start', run_id: null, payload: null, status: 'done', attempts: 1,
  max_attempts: 3, claimed_by: null, last_error: null, result: null, due_at: null,
  created_at: '2026-09-13 09:00:00', finished_at: null, fleet_id: 7, ...over,
})

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  i18n.global.locale.value = 'fr'
  document.body.replaceChildren()
})

describe('une campagne : les compteurs de TOUTE la campagne', () => {
  it('affiche les compteurs servis par op=state, pas ceux d’une fenêtre de travaux', async () => {
    api.getRunnerFleetState.mockResolvedValue({ fleet: flotte({}), state: ETAT })
    const C = (await import('./CampaignCard.vue')).default
    const hote = await monter(C, { fleet: flotte({}), ouverteParDefaut: true })

    expect(api.getRunnerFleetState).toHaveBeenCalledWith(7)
    // Aucune liste de travaux n'est lue pour compter.
    expect(api.listRunnerJobs).not.toHaveBeenCalled()
    const paires = [...hote.querySelectorAll('[data-test="compteurs"] > div')]
      .map((d) => `${d.querySelector('dt')!.textContent!.trim()} ${d.querySelector('dd')!.textContent!.trim()}`)
    expect(paires).toEqual(['faits 1790', 'en file 12', 'en vol 3', 'en échec 35', 'dont abandonnés 4', 'total 1840'])
    expect(hote.textContent).toContain('5.4 M')
    expect(hote.textContent).toContain('21 k')
    // `heaviest_row_tokens` est le maximum PAR TRAVAIL, malgré son nom : jamais « ligne ».
    expect(hote.textContent).toContain('travail le plus lourd')
    expect(hote.textContent).not.toContain('ligne la plus lourde')
    expect(hote.textContent).toContain('en cours')
  })

  it('une carte fermée ne lit rien avant son ouverture', async () => {
    api.getRunnerFleetState.mockResolvedValue({ fleet: flotte({}), state: ETAT })
    const C = (await import('./CampaignCard.vue')).default
    const hote = await monter(C, { fleet: flotte({ status: 'draft' }), ouverteParDefaut: false })
    expect(api.getRunnerFleetState).not.toHaveBeenCalled()
    expect(hote.textContent).toContain('non armée')
    ;(hote.querySelector('button') as HTMLButtonElement).click()
    await vider()
    expect(api.getRunnerFleetState).toHaveBeenCalledTimes(1)
    // Lue, la flotte `draft` qui porte des travaux se dit historique.
    expect(hote.textContent).toContain('historique')
    expect(hote.textContent).not.toContain('brouillon')
  })
})

// Deux champs déclarés d'une flotte que l'écran ne doit pas faire mentir (session flotte,
// 13/09, lu dans `db/runner_fleets.py` du tronc) :
//   • `workers` est stocké mais NON APPLIQUÉ en hébergé — `campagne_a_servir` ne le lit
//     pas. Le parallélisme réel est le nombre de travaux `claimed` ;
//   • `max_rows` borne des TRAVAUX produits, quel que soit leur statut, pas des lignes.
// L'écran n'affiche pas `workers` ; s'il l'affiche un jour, c'est « déclaré, non appliqué ».
// `max_rows` ne s'affiche que dans le refus de relance R1 (lot 2), « travaux produits : N
// sur M » — tenu par `campaignActions.spec.ts`. Sur une campagne en cours, ces tests tiennent
// le silence.
describe('une campagne : ce que les champs déclarés ne disent pas', () => {
  it('le parallélisme se lit sur les travaux en vol, jamais sur `workers` déclaré', async () => {
    api.getRunnerFleetState.mockResolvedValue({ fleet: flotte({}), state: ETAT })
    const C = (await import('./CampaignCard.vue')).default
    const hote = await monter(C, { fleet: flotte({ workers: 97 }), ouverteParDefaut: true })
    const texte = hote.textContent ?? ''
    expect(texte).not.toContain('97')
    expect(texte.toLowerCase()).not.toMatch(/parall/)
    const paires = [...hote.querySelectorAll('[data-test="compteurs"] > div')]
      .map((d) => `${d.querySelector('dt')!.textContent!.trim()} ${d.querySelector('dd')!.textContent!.trim()}`)
    expect(paires).toContain('en vol 3')
  })

  it('`max_rows` n’est jamais dit en lignes — il ne s’affiche pas', async () => {
    api.getRunnerFleetState.mockResolvedValue({ fleet: flotte({}), state: ETAT })
    const C = (await import('./CampaignCard.vue')).default
    const hote = await monter(C, { fleet: flotte({ max_rows: 4321 }), ouverteParDefaut: true })
    expect(hote.textContent).not.toContain('4321')
  })

  it('aucune copie de campagne ne parle de parallélisme ni de lignes visées', () => {
    for (const langue of ['fr', 'en'] as const) {
      const copie = JSON.stringify((i18n.global.getLocaleMessage(langue) as Record<string, unknown>).automations)
      expect(copie.toLowerCase(), langue).not.toMatch(/parall|lignes visées|rows targeted|max_rows/)
    }
  })
})

describe('la section des campagnes', () => {
  it('le 403 bêta dit « non activées », sans rouge et sans panne', async () => {
    api.listRunnerFleets.mockRejectedValue(new ApiError(403, 'beta_required', 'les passages sont en bêta'))
    const C = (await import('./CampaignsSection.vue')).default
    const hote = await monter(C)
    expect(hote.textContent).toContain('Campagnes non activées pour cette organisation.')
    expect(hote.querySelector('[role="alert"]')).toBeNull()
  })

  it('un AUTRE 403 reste une erreur — le silence ne vaut que pour la bêta', async () => {
    api.listRunnerFleets.mockRejectedValue(new ApiError(403, 'forbidden'))
    const C = (await import('./CampaignsSection.vue')).default
    const hote = await monter(C)
    expect(hote.textContent).not.toContain('non activées')
    expect(hote.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('l’erreur d’une carte reste dans la carte, et s’efface à la lecture suivante', async () => {
    // `op=state` rend la MÊME flotte que la liste : la carte la remonte à la section, qui la
    // remplace (lot 2) — une doublure qui rendrait une autre flotte renommerait la carte.
    const liste = [flotte({ id: 1, label: 'en-panne' }), flotte({ id: 2, label: 'saine' })]
    api.listRunnerFleets.mockResolvedValue({ fleets: liste })
    api.getRunnerFleetState.mockImplementation(async (id: number) => {
      if (id === 1) throw new ApiError(500, 'boom')
      return { fleet: liste.find((f) => f.id === id), state: ETAT }
    })
    const C = (await import('./CampaignsSection.vue')).default
    const hote = await monter(C)

    expect(hote.querySelectorAll('li.cc')).toHaveLength(2)
    const carte = (nom: string) => [...hote.querySelectorAll('li.cc')]
      .find((c) => c.querySelector('.cc-name')?.textContent === nom)!
    expect(carte('en-panne').textContent).toContain('Compteurs illisibles')
    expect(carte('saine').textContent).not.toContain('Compteurs illisibles')
    expect(carte('saine').textContent).toContain('1790')

    api.getRunnerFleetState.mockResolvedValue({ fleet: liste[0], state: ETAT })
    const tete = carte('en-panne').querySelector('button') as HTMLButtonElement
    tete.click(); await vider()
    tete.click(); await vider()
    expect(carte('en-panne').textContent).not.toContain('Compteurs illisibles')
    expect(carte('en-panne').textContent).toContain('1790')
  })
})

describe('les travaux d’une campagne', () => {
  it('paginent par curseur, sous le filtre de la campagne, avec le total du serveur', async () => {
    api.listRunnerJobs
      .mockResolvedValueOnce({ jobs: [travail({ id: 10 }), travail({ id: 9 })], total: 3, next_cursor: 'c1' })
      .mockResolvedValueOnce({ jobs: [travail({ id: 8 })], total: 3, next_cursor: null })
    const C = (await import('./RunnerJobList.vue')).default
    const hote = await monter(C, { filtre: { fleet_id: 7 } })

    expect(api.listRunnerJobs).toHaveBeenNthCalledWith(1, { fleet_id: 7 }, { limit: 25 })
    expect(hote.textContent).toContain('2 affichés sur 3')
    const suite = [...hote.querySelectorAll('button')].find((b) => b.textContent?.includes('Afficher la suite'))!
    suite.click()
    await vider()
    expect(api.listRunnerJobs).toHaveBeenNthCalledWith(2, { fleet_id: 7 }, { limit: 25, cursor: 'c1' })
    expect(hote.querySelectorAll('li')).toHaveLength(3)
    expect(hote.textContent).toContain('3 affichés sur 3')
    expect([...hote.querySelectorAll('button')].some((b) => b.textContent?.includes('Afficher la suite'))).toBe(false)
  })

  it('un travail conclu sans résultat a un coût INCONNU, jamais « 0 jetons »', async () => {
    api.listRunnerJobs.mockResolvedValue({
      jobs: [
        travail({ id: 3, status: 'done', result: null }),
        travail({ id: 2, status: 'done', result: { usage_tokens: 1500 } }),
        travail({ id: 1, status: 'pending', result: null }),
      ],
      total: 3, next_cursor: null,
    })
    const C = (await import('./RunnerJobList.vue')).default
    const hote = await monter(C, { filtre: { fleet_id: 7 } })
    const lignes = [...hote.querySelectorAll('li')].map((l) => l.textContent ?? '')
    expect(lignes[0]).toContain('coût inconnu')
    expect(lignes[0]).not.toContain('0 jetons')
    expect(lignes[1]).toContain('2 k jetons')
    // En file, le coût est inconnu par nature : rien à dire.
    expect(lignes[2]).not.toContain('coût inconnu')
  })
})

// Les pages de l'espace (entrée, campagne, programmation, exécution…) et leurs erreurs
// confinées sont tenues par `views/console/automations/espace*.spec.ts` (oto#214).
