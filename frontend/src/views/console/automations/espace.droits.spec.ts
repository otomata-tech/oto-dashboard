// L'espace Automatisations (oto#214) : les DROITS, et la contre-épreuve de l'historique.
//
// Les gestes des lots 1 et 2 passent sur les pages sans changer : armer et relancer à l'admin
// d'org, arrêter à tout membre, rien en consultation en lecture seule ; sur une programmation,
// tout membre hors consultation, puisque le serveur servi n'a pas de garde admin (la réserve
// décidée n'est pas servie, et aucun texte ne la suppose).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api'
import { i18n } from '@/lib/i18n'
import {
  ADMIN, CAMPAGNE_7, cliquer, ETAT, flotte, LECTURE, MEMBRE, monterEspace, naviguer, servirMonde,
  vider, type Bouchons, type Monte,
} from './__tests__/banc'

const api = vi.hoisted(() => ({
  listRunnerFleets: vi.fn(), getRunnerFleet: vi.fn(), getRunnerFleetState: vi.fn(),
  launchRunnerFleet: vi.fn(), stopRunnerFleet: vi.fn(), listRunnerJobs: vi.fn(), getRunnerJob: vi.fn(),
  listRunnerTriggers: vi.fn(), getRunnerTrigger: vi.fn(), updateRunnerTrigger: vi.fn(),
  deleteRunnerTrigger: vi.fn(), getConnectorInstances: vi.fn(), getRunThread: vi.fn(), getNamespaceQueue: vi.fn(),
  listRunnerDeliveries: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const me = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }))
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me }),
}))

// Le MUTANT « historique sans filtre » : la page de la campagne lirait toute la file de l'org.
// Éteint partout ; seule la contre-épreuve l'allume (sur un checkout partagé, la mutation se
// simule en mémoire).
const mutant = vi.hoisted(() => ({ actif: false }))
vi.mock('@/lib/automationsEspace', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('@/lib/automationsEspace')>()
  return {
    ...vrai,
    historiqueDe: (objet: 'campagne' | 'programmation', id: number) =>
      (mutant.actif ? {} : vrai.historiqueDe(objet, id)),
  }
})

const bouchons = api as unknown as Bouchons
let courant: Monte | null = null
async function ouvrir(url: string) {
  courant?.demonter()
  courant = await monterEspace(url)
  return courant
}
const sel = (m: Monte, test: string) => m.hote.querySelector(`[data-test="${test}"]`)
const gestes = (m: Monte) => [...m.hote.querySelectorAll('[data-test^="geste-"]')].map((b) => b.textContent!.trim())

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  i18n.global.locale.value = 'fr'
  me.value = MEMBRE
  mutant.actif = false
  document.body.replaceChildren()
})
afterEach(() => { courant?.demonter(); courant = null; mutant.actif = false })

const ARRETEE = flotte({ status: 'stopped', stop_reason: 'arrêt demandé', stopped_at: '2026-09-13 10:00:00' })

describe('la page d’une campagne : les gestes existants, par droit', () => {
  it.each([
    ['admin d’org', ADMIN, ARRETEE, ['Relancer']],
    ['membre', MEMBRE, ARRETEE, []],
    ['lecture seule', LECTURE, ARRETEE, []],
    ['admin d’org', ADMIN, flotte(), ['Arrêter']],
    ['membre', MEMBRE, flotte(), ['Arrêter']],
    ['lecture seule', LECTURE, flotte(), []],
  ])('%s, campagne %s', async (_qui, profil, fl, attendus) => {
    me.value = profil
    servirMonde(bouchons, { fleets: [fl] })
    expect(gestes(await ouvrir('/automations/campaigns/7'))).toEqual(attendus)
  })

  it('lecture seule : le serveur refuse `state` ; identité et historique restent lisibles', async () => {
    me.value = LECTURE
    servirMonde(bouchons)
    api.getRunnerFleetState.mockRejectedValue(new ApiError(403, 'view_as_read_only'))
    const m = await ouvrir('/automations/campaigns/7')
    expect(sel(m, 'identite')!.textContent).toContain('clients')
    expect(m.hote.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(m.hote.querySelector('[role="alert"]')!.textContent).toContain('Compteurs illisibles')
    expect(m.hote.querySelectorAll('[data-test="historique"] li[data-job]')).toHaveLength(25)
    expect(gestes(m)).toEqual([])
  })

  it('arrêter depuis la page : le geste des lots 1 et 2, la réponse servie s’affiche', async () => {
    servirMonde(bouchons)
    api.stopRunnerFleet.mockResolvedValue({ fleet: flotte({ status: 'stopping', stopping_at: '2026-09-13 11:59:50' }) })
    const m = await ouvrir('/automations/campaigns/7')
    await cliquer(sel(m, 'geste-arreter'))
    await cliquer(sel(m, 'confirmer'))
    expect(api.stopRunnerFleet).toHaveBeenCalledWith(7)
    expect(sel(m, 'statut')!.textContent).toContain('arrêt demandé')
    expect(sel(m, 'statut')!.textContent).not.toContain('arrêtée')
  })
})

describe('une programmation : ce que le serveur sert, sans garde admin', () => {
  it.each([['membre', MEMBRE, true], ['admin d’org', ADMIN, true], ['lecture seule', LECTURE, false]] as const)(
    'aperçu, %s : lien vers les réglages %s', async (_qui, profil, offert) => {
      me.value = profil
      servirMonde(bouchons)
      const m = await ouvrir('/automations/schedules/3')
      expect(sel(m, 'lien-reglages') !== null).toBe(offert)
      if (offert) expect(sel(m, 'lien-reglages')!.getAttribute('href')).toBe('/automations/schedules/3/settings')
    })

  it('réglages, membre : l’interrupteur n’envoie que `enabled`, la réponse fait foi', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/schedules/3/settings')
    expect(sel(m, 'reglage')).not.toBeNull()
    expect(sel(m, 'supprimer')).not.toBeNull()
    await cliquer(sel(m, 'interrupteur'))
    expect(api.updateRunnerTrigger).toHaveBeenCalledWith(3, { enabled: false })
    expect(m.hote.textContent).toContain('coupée')
  })

  it('réglages, lecture seule : aucun geste, et la page le dit', async () => {
    me.value = LECTURE
    servirMonde(bouchons)
    const m = await ouvrir('/automations/schedules/3/settings')
    expect(sel(m, 'lecture-seule')).not.toBeNull()
    for (const geste of ['interrupteur', 'reglage', 'supprimer']) expect(sel(m, geste)).toBeNull()
    expect(api.updateRunnerTrigger).not.toHaveBeenCalled()
  })

  it('enregistrer : seul le champ modifié part, puis la page de la programmation', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/schedules/3/settings')
    const champ = m.hote.querySelector('[data-test="cron"]') as HTMLInputElement
    champ.value = '0 9 * * *'
    champ.dispatchEvent(new Event('input'))
    await vider()
    await naviguer(m.router, () => (sel(m, 'enregistrer') as HTMLElement).click())
    expect(api.updateRunnerTrigger).toHaveBeenCalledWith(3, { cron: '0 9 * * *' })
    expect(m.router.currentRoute.value.path).toBe('/automations/schedules/3')
  })

  it('supprimer, confirmé sur place, mène à la liste des automatisations', async () => {
    servirMonde(bouchons)
    api.deleteRunnerTrigger.mockResolvedValue({ ok: true })
    const m = await ouvrir('/automations/schedules/3/settings')
    await cliquer(sel(m, 'supprimer'))
    await naviguer(m.router, () => (sel(m, 'confirmer') as HTMLElement).click())
    expect(api.deleteRunnerTrigger).toHaveBeenCalledWith(3)
    expect(m.router.currentRoute.value.path).toBe('/automations')
  })

  it('aucun texte ne réserve les réglages à un admin : cette décision n’est pas servie', async () => {
    servirMonde(bouchons)
    for (const langue of ['fr', 'en'] as const) {
      i18n.global.locale.value = langue
      const m = await ouvrir('/automations/schedules/3/settings')
      expect(m.hote.textContent!.toLowerCase(), langue).not.toMatch(/admin/)
    }
  })
})

describe('contre-épreuve : l’historique d’une campagne se lit sous son `fleet_id`', () => {
  /** Rend ce qui trahit un historique lu hors de la campagne. */
  function garde(m: Monte): string[] {
    const fautes: string[] = []
    const ids = [...m.hote.querySelectorAll('[data-test="historique"] li[data-job]')]
      .map((li) => Number(li.getAttribute('data-job')))
    const etrangeres = ids.filter((id) => !CAMPAGNE_7.includes(id))
    if (etrangeres.length) fautes.push(`exécutions d'ailleurs : ${etrangeres.join(', ')}`)
    const pied = m.hote.querySelector('[data-test="historique"] .jl-foot')?.textContent ?? ''
    if (!pied.includes(`sur ${CAMPAGNE_7.length}`)) fautes.push(`total qui n'est pas celui de la campagne : ${pied.trim()}`)
    return fautes
  }

  it('la garde ne voit rien sur la page telle qu’elle est', async () => {
    servirMonde(bouchons, { etat: () => ETAT })
    expect(garde(await ouvrir('/automations/campaigns/7'))).toEqual([])
  })

  it('mutant : sans `fleet_id`, la garde rougit', async () => {
    mutant.actif = true
    servirMonde(bouchons)
    const m = await ouvrir('/automations/campaigns/7')
    // Le mutant est bien vivant : la liste est partie sans filtre.
    expect(api.listRunnerJobs).toHaveBeenCalledWith({}, { limit: 25 })
    const fautes = garde(m)
    expect(fautes).toHaveLength(2)
    expect(fautes[0]).toContain('302')
  })
})
