// /automations, lot 2 d'oto#205 : les GESTES d'une campagne, montés dans la section.
//
// Ce qui se prouve ici et nulle part ailleurs : l'écran n'affiche un ABOUTISSEMENT
// (« en cours », « arrêtée ») que sur une relecture qui le sert — jamais sur la réponse
// du geste, qui est une intention écrite. La garde relève le DOM à CHAQUE pas de la
// fenêtre d'observation ; la contre-épreuve allume un mutant qui affiche l'intention, et
// la garde doit alors le voir (sur un checkout partagé, la mutation se simule en mémoire).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { ApiError } from '@/api'
import type { RunnerFleet, RunnerFleetState } from '@/api/console'
import { i18n } from '@/lib/i18n'

const api = vi.hoisted(() => ({
  listRunnerFleets: vi.fn(), getRunnerFleetState: vi.fn(), launchRunnerFleet: vi.fn(),
  stopRunnerFleet: vi.fn(), listRunnerJobs: vi.fn(),
}))
vi.mock('@/api/console', () => api)

type MeLite = { sub: string; role: string; org_role: string | null; active_org_readonly?: boolean }
const me = ref<MeLite | null>(null)
vi.mock('@/composables/useMe', () => ({
  useMe: () => ({ me }),
  isSuperAdmin: (m: MeLite | null) => m?.role === 'super_admin',
}))

// Le MUTANT « affiche l'intention » : un arrêt demandé se dit arrêté, un armement se dit
// en cours. Éteint partout ; seule la contre-épreuve l'allume.
const mutant = vi.hoisted(() => ({ actif: false }))
vi.mock('@/lib/runnerFleets', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('@/lib/runnerFleets')>()
  const INTENTION: Record<string, string> = { stopping: 'stopped', armed: 'running' }
  return {
    ...vrai,
    libelleCampagne: (fl: RunnerFleet, etat: RunnerFleetState | null) => {
      const visee = mutant.actif && fl.status ? INTENTION[fl.status] : undefined
      return vrai.libelleCampagne(visee ? { ...fl, status: visee } : fl, etat)
    },
  }
})

const vider = async () => {
  for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(0); await nextTick() }
}
const pas = async (ms = 5_000) => { await vi.advanceTimersByTimeAsync(ms); await vider() }

const flotte = (over: Partial<RunnerFleet> = {}): RunnerFleet => ({
  id: 7, label: 'relance', procedure: 'relance-clients', namespace: 'clients', model: null,
  status: 'running', stop_reason: null, max_rows: null, armed_at: '2026-09-13 08:00:00',
  started_at: '2026-09-13 08:00:05', stopping_at: null, heartbeat_at: null, stopped_at: null,
  created_at: '2026-09-13 07:00:00', ...over,
} as RunnerFleet)
const ETAT: RunnerFleetState = {
  jobs_total: 40, pending: 2, claimed: 3, done: 35, failed: 0, abandoned: 0, usage_tokens: 90_000,
  heaviest_row_tokens: 4_000, last_finished: '2026-09-13 11:58:00', no_jobs_attached: false,
}
const VIERGE: RunnerFleetState = {
  ...ETAT, jobs_total: 0, pending: 0, claimed: 0, done: 0, usage_tokens: 0,
  heaviest_row_tokens: null, last_finished: null, no_jobs_attached: true,
}
const ADMIN: MeLite = { sub: 'a', role: 'member', org_role: 'org_admin' }
const MEMBRE: MeLite = { sub: 'm', role: 'member', org_role: 'org_member' }
const ARRETEE = flotte({ status: 'stopped', stop_reason: 'arrêt demandé', stopped_at: '2026-09-13 10:00:00' })
const BROUILLON = flotte({ id: 9, label: 'veille', status: 'draft', armed_at: null, started_at: null })
const ARMEE = flotte({ id: 9, label: 'veille', status: 'armed', armed_at: '2026-09-13 11:59:59', started_at: null })

let demonter: (() => void) | null = null

function servir(fleets: RunnerFleet[], etat: (fl: RunnerFleet) => RunnerFleetState = () => ETAT) {
  api.listRunnerFleets.mockResolvedValue({ fleets })
  api.getRunnerFleetState.mockImplementation(async (id: number) => {
    const fl = fleets.find((x) => x.id === id)!
    return { fleet: fl, state: etat(fl) }
  })
}

async function monterSection() {
  const C = (await import('./CampaignsSection.vue')).default
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const app = createApp(C)
  app.use(i18n)
  app.mount(hote)
  demonter = () => app.unmount()
  await vider()
  return hote
}

const gestes = (hote: HTMLElement) =>
  [...hote.querySelectorAll('[data-test^="geste-"]')].map((b) => b.textContent!.trim())
const cliquer = async (hote: HTMLElement, sel: string) => {
  (hote.querySelector(sel) as HTMLButtonElement).click()
  await vider()
}
const lectures = () => api.getRunnerFleetState.mock.calls.length

/** Geste confirmé, puis `n` relectures qui servent l'état intermédiaire, puis une qui sert
 * l'aboutissement. Rend les pas où le mot interdit était DÉJÀ affiché. */
async function observer(hote: HTMLElement, geste: string, interdit: string, n: number) {
  await cliquer(hote, `[data-test="geste-${geste}"]`)
  await cliquer(hote, '[data-test="confirmer"]')
  const fautes: number[] = []
  for (let i = 0; i <= n; i++) {
    if (hote.textContent!.includes(interdit)) fautes.push(i)
    if (i < n) await pas()
  }
  await pas()
  return { fautes, final: hote.textContent ?? '' }
}

async function scenarioArret(interdit: string, n = 4) {
  me.value = MEMBRE
  const courante = flotte()
  let lu = 0
  api.listRunnerFleets.mockResolvedValue({ fleets: [courante] })
  api.getRunnerFleetState.mockImplementation(async () => {
    lu++
    if (lu === 1) return { fleet: courante, state: ETAT }
    const demande = flotte({ status: 'stopping', stopping_at: '2026-09-13 11:59:50' })
    if (lu <= 1 + n) return { fleet: demande, state: ETAT }
    return { fleet: { ...demande, status: 'stopped', stopped_at: '2026-09-13 12:00:30', stop_reason: 'arrêt demandé' },
      state: { ...ETAT, claimed: 0, pending: 0 } }
  })
  api.stopRunnerFleet.mockResolvedValue({ fleet: flotte({ status: 'stopping', stopping_at: '2026-09-13 11:59:50' }) })
  const hote = await monterSection()
  return observer(hote, 'arreter', interdit, n)
}

async function scenarioArmement(interdit: string, n = 4) {
  me.value = ADMIN
  let lu = 0
  api.listRunnerFleets.mockResolvedValue({ fleets: [BROUILLON] })
  api.getRunnerFleetState.mockImplementation(async () => {
    lu++
    if (lu === 1) return { fleet: BROUILLON, state: VIERGE }
    if (lu <= 1 + n) return { fleet: ARMEE, state: VIERGE }
    return { fleet: { ...ARMEE, status: 'running', started_at: '2026-09-13 12:00:25' },
      state: { ...VIERGE, jobs_total: 1, claimed: 1, no_jobs_attached: false } }
  })
  api.launchRunnerFleet.mockResolvedValue({ fleet: ARMEE, budget_max_tokens: null })
  const hote = await monterSection()
  return observer(hote, 'armer', interdit, n)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-13T12:00:00Z'))
  for (const fn of Object.values(api)) fn.mockReset()
  i18n.global.locale.value = 'fr'
  me.value = ADMIN
  mutant.actif = false
  document.body.replaceChildren()
})
afterEach(() => {
  demonter?.()
  demonter = null
  vi.useRealTimers()
})

describe('témoin = relecture observée', () => {
  it.each([['fr', 'arrêtée'], ['en', 'stopped']] as const)(
    'arrêt (%s) : jamais « %s » tant que les relectures servent `stopping`', async (langue, mot) => {
      i18n.global.locale.value = langue
      const { fautes, final } = await scenarioArret(mot)
      expect(fautes).toEqual([])
      expect(api.stopRunnerFleet).toHaveBeenCalledWith(7)
      expect(lectures()).toBe(6)
      expect(final).toContain(mot)
    })

  it.each([['fr', 'en cours'], ['en', 'running']] as const)(
    'armement (%s) : jamais « %s » tant que les relectures servent `armed`', async (langue, mot) => {
      i18n.global.locale.value = langue
      const { fautes, final } = await scenarioArmement(mot)
      expect(fautes).toEqual([])
      expect(api.launchRunnerFleet).toHaveBeenCalledWith(9)
      expect(final).toContain(mot)
    })

  it('contre-épreuve : un écran qui affiche l’intention fait rougir les deux gardes', async () => {
    mutant.actif = true
    expect((await scenarioArret('arrêtée')).fautes.length).toBeGreaterThan(0)
    demonter?.()
    document.body.replaceChildren()
    for (const fn of Object.values(api)) fn.mockReset()
    expect((await scenarioArmement('en cours')).fautes.length).toBeGreaterThan(0)
  })

  it('la réponse `stopping` se dit « arrêt demandé, N en vol », et la dépense qui continue', async () => {
    me.value = MEMBRE
    servir([flotte()])
    api.stopRunnerFleet.mockResolvedValue({ fleet: flotte({ status: 'stopping', stopping_at: '2026-09-13 11:59:30' }) })
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-arreter"]')
    await cliquer(hote, '[data-test="confirmer"]')
    const texte = hote.textContent ?? ''
    expect(texte).toContain('arrêt demandé, 3 en vol')
    expect(texte).toContain("Arrêt demandé depuis 30 s : il sera constaté au prochain passage d'un worker.")
    expect(texte).toContain("Les travaux en vol continuent de dépenser jusqu'à leur fin.")
    expect(gestes(hote)).toEqual([])
  })

  it('la réponse `armed` s’affiche : c’est un fait écrit par le serveur', async () => {
    servir([BROUILLON], () => VIERGE)
    api.launchRunnerFleet.mockResolvedValue({ fleet: ARMEE, budget_max_tokens: 900_000 })
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-armer"]')
    await cliquer(hote, '[data-test="confirmer"]')
    expect(hote.textContent).toContain('armée, en attente du premier travail')
    // Le plafond n'est pas appliqué : le pire cas servi ne s'affiche pas.
    expect(hote.textContent).not.toContain('900')
  })
})

describe('la fenêtre d’observation', () => {
  it('relit toutes les 5 s pendant 60 s après un armement, puis rend la main', async () => {
    servir([BROUILLON], () => VIERGE)
    api.launchRunnerFleet.mockResolvedValue({ fleet: ARMEE, budget_max_tokens: null })
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-armer"]')
    await cliquer(hote, '[data-test="confirmer"]')
    const avant = lectures()
    await pas(60_000)
    expect(lectures() - avant).toBe(12)
    await pas(60_000)
    expect(lectures() - avant).toBe(12)
  })

  it('relit pendant 2 min après un arrêt', async () => {
    me.value = MEMBRE
    servir([flotte()])
    api.stopRunnerFleet.mockResolvedValue({ fleet: flotte({ status: 'stopping' }) })
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-arreter"]')
    await cliquer(hote, '[data-test="confirmer"]')
    const avant = lectures()
    await pas(120_000)
    expect(lectures() - avant).toBe(24)
    await pas(60_000)
    expect(lectures() - avant).toBe(24)
  })

  it('onglet caché : aucune relecture ne part', async () => {
    servir([BROUILLON], () => VIERGE)
    api.launchRunnerFleet.mockResolvedValue({ fleet: ARMEE, budget_max_tokens: null })
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-armer"]')
    await cliquer(hote, '[data-test="confirmer"]')
    const avant = lectures()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    try {
      await pas(20_000)
      expect(lectures() - avant).toBe(0)
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState
    }
    await pas(5_000)
    expect(lectures() - avant).toBe(1)
  })

  it('démontage : plus rien ne part', async () => {
    servir([BROUILLON], () => VIERGE)
    api.launchRunnerFleet.mockResolvedValue({ fleet: ARMEE, budget_max_tokens: null })
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-armer"]')
    await cliquer(hote, '[data-test="confirmer"]')
    const avant = lectures()
    demonter?.()
    demonter = null
    await pas(60_000)
    expect(lectures() - avant).toBe(0)
  })
})

describe('les refus, tels que servis', () => {
  it('409 not_launchable : le détail mot pour mot, le code, et une relecture', async () => {
    servir([ARRETEE])
    const detail = "ce passage est `running` — on n'arme que ce qui ne tourne pas. Arrête-le d'abord, ou déclare une autre flotte."
    api.launchRunnerFleet.mockRejectedValue(new ApiError(409, 'not_launchable', detail))
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-relancer"]')
    const avant = lectures()
    await cliquer(hote, '[data-test="confirmer"]')
    const alerte = hote.querySelector('[role="alert"]')!.textContent!
    expect(alerte).toContain(`Refusé : ${detail}`)
    expect(alerte).toContain('not_launchable')
    expect(lectures()).toBe(avant + 1)
  })

  it.each([
    [403, 'org_admin_required', "lancer un passage est réservé aux administrateurs de l'org : il engage une dépense et des écritures chez un tiers. L'ARRÊTER, en revanche, est ouvert à tout membre."],
    [400, 'model_not_served', "aucun worker ne sert les modèles `mistral` en ce moment (aucun worker vivant n'a déclaré de famille)."],
  ])('%i %s : affiché tel quel, sans relecture', async (status, code, detail) => {
    servir([ARRETEE])
    api.launchRunnerFleet.mockRejectedValue(new ApiError(status, code, detail))
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-relancer"]')
    const avant = lectures()
    await cliquer(hote, '[data-test="confirmer"]')
    const alerte = hote.querySelector('[role="alert"]')!.textContent!
    expect(alerte).toContain(`Refusé : ${detail}`)
    expect(alerte).toContain(code)
    expect(lectures()).toBe(avant)
    // Le geste reste offert : le refus ne fabrique pas un état.
    expect(gestes(hote)).toEqual(['Relancer'])
  })
})

describe('qui voit quel geste', () => {
  const MONDE = [
    flotte({ id: 1, label: 'un', status: 'draft', armed_at: null, started_at: null }),
    flotte({ id: 2, label: 'deux', status: 'stopped', stop_reason: 'arrêt demandé', stopped_at: '2026-09-13 10:00:00' }),
    flotte({ id: 3, label: 'trois', status: 'running' }),
  ]
  const etatDe = (fl: RunnerFleet) => (fl.id === 1 ? VIERGE : ETAT)

  it('un membre ne voit ni Armer ni Relancer, mais voit Arrêter', async () => {
    me.value = MEMBRE
    servir(MONDE, etatDe)
    const hote = await monterSection()
    expect(gestes(hote)).toEqual(['Arrêter'])
    expect(hote.querySelector('[data-test="empechement"]')).toBeNull()
  })

  it('le même monde vu par un admin d’org : les trois gestes', async () => {
    servir(MONDE, etatDe)
    const hote = await monterSection()
    expect(gestes(hote).sort()).toEqual(['Armer', 'Arrêter', 'Relancer'])
  })

  it('l’admin plateforme membre de l’org : Arrêter seulement (oto#210)', async () => {
    me.value = { sub: 'op', role: 'admin', org_role: 'org_member' }
    servir(MONDE, etatDe)
    expect(gestes(await monterSection())).toEqual(['Arrêter'])
  })

  it('consultation en lecture seule : aucun geste', async () => {
    me.value = { sub: 'sa', role: 'super_admin', org_role: null, active_org_readonly: true }
    servir(MONDE, etatDe)
    expect(gestes(await monterSection())).toEqual([])
  })

  it('un brouillon dont l’état n’est pas lu ne propose rien', async () => {
    api.listRunnerFleets.mockResolvedValue({ fleets: [BROUILLON] })
    api.getRunnerFleetState.mockImplementation(() => new Promise(() => {}))
    expect(gestes(await monterSection())).toEqual([])
  })

  it('`stopping` : aucun geste', async () => {
    servir([flotte({ status: 'stopping', stopping_at: '2026-09-13 11:00:00' })])
    expect(gestes(await monterSection())).toEqual([])
  })
})

describe('pas de relance qui ne produirait rien : le levier est nommé', () => {
  const levier = 'demande à ton agent de déclarer une nouvelle campagne'

  it.each([
    ['historique', BROUILLON, ETAT, 'Aucun geste sur une campagne historique.'],
    ['R1 borne atteinte', flotte({ ...ARRETEE, max_rows: 40 }), ETAT, 'Pas de relance : borne atteinte, travaux produits : 40 sur 40.'],
    ['R2 échecs consécutifs', flotte({ ...ARRETEE, stop_reason: 'max_consecutive_failures' }), ETAT, 'Pas de relance : arrêtée pour échecs consécutifs'],
  ])('%s', async (_nom, fl, etat, phrase) => {
    servir([fl], () => etat)
    const hote = await monterSection()
    expect(gestes(hote)).toEqual([])
    const empechement = hote.querySelector('[data-test="empechement"]')!.textContent!
    expect(empechement).toContain(phrase)
    expect(empechement).toContain(levier)
    expect(empechement.toLowerCase()).not.toMatch(/augment|max_rows|increase/)
  })
})

describe('la confirmation sur place', () => {
  it('Armer rappelle ce qui ne change plus ; Annuler n’envoie rien', async () => {
    servir([BROUILLON], () => VIERGE)
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-armer"]')
    expect(hote.textContent).toContain('Armer « veille » ? Procédure, tableau et modèle ne se changent plus.')
    await cliquer(hote, '[data-test="annuler"]')
    expect(api.launchRunnerFleet).not.toHaveBeenCalled()
    expect(gestes(hote)).toEqual(['Armer'])
  })

  it('Relancer rappelle la même chose', async () => {
    servir([ARRETEE])
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-relancer"]')
    expect(hote.textContent).toContain('Relancer « relance » ? Procédure, tableau et modèle ne se changent plus.')
  })

  it('Arrêter dit que les travaux en vol continuent, et dépensent', async () => {
    servir([flotte()])
    const hote = await monterSection()
    await cliquer(hote, '[data-test="geste-arreter"]')
    expect(hote.textContent).toContain("Demander l'arrêt ? Les travaux en vol continuent, et dépensent, jusqu'à leur fin.")
    expect(api.stopRunnerFleet).not.toHaveBeenCalled()
  })
})
