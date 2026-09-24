// L'espace Automatisations (oto#214), monté comme la coque le monte. Ce qui se prouve ici :
// chaque page s'ouvre par son ADRESSE et se recharge ; le retour navigateur garde filtres et
// pagination ; l'ancien `?run=` aboutit ; une adresse qui ne désigne rien se dit ; la bêta
// absente ne rougit rien ; une erreur reste dans sa section ; les historiques paginent sous
// leur filtre serveur. Droits et contre-épreuve : `espace.droits.spec.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api'
import { i18n } from '@/lib/i18n'
import {
  cliquer, FILE, flotte, MEMBRE, monterEspace, naviguer, programmation, servirMonde, travail, webhook,
  type Bouchons, type Monte,
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
// Les helpers de rôle sont les VRAIS (oto#210) : seul le profil est un bouchon.
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me }),
}))

const bouchons = api as unknown as Bouchons
let courant: Monte | null = null
async function ouvrir(url: string) {
  courant?.demonter()
  courant = await monterEspace(url)
  return courant
}
const effacer = () => { for (const f of Object.values(api)) f.mockClear() }
const texte = (m: Monte, sel: string) => m.hote.querySelector(sel)?.textContent ?? ''

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  i18n.global.locale.value = 'fr'
  me.value = MEMBRE
  document.body.replaceChildren()
})
afterEach(() => { courant?.demonter(); courant = null })

describe('chaque page s’ouvre par son adresse, et se recharge à l’identique', () => {
  const PAGES: Array<[string, () => void, string]> = [
    ['/automations', () => {
      expect(api.listRunnerTriggers).toHaveBeenCalledWith(undefined)
      expect(api.listRunnerFleets).toHaveBeenCalled()
      expect(api.listRunnerJobs).toHaveBeenCalledWith({ status: 'failed' }, { limit: 5 })
    }, 'À surveiller'],
    ['/automations/campaigns', () => expect(api.listRunnerFleets).toHaveBeenCalled(), 'relance'],
    ['/automations/campaigns/7', () => {
      expect(api.getRunnerFleet).toHaveBeenCalledWith(7)
      expect(api.getRunnerFleetState).toHaveBeenCalledWith(7)
      expect(api.listRunnerJobs).toHaveBeenCalledWith({ fleet_id: 7 }, { limit: 25 })
    }, 'Historique des exécutions'],
    ['/automations/schedules', () => expect(api.listRunnerTriggers).toHaveBeenCalledWith(undefined), 'Veille du matin'],
    ['/automations/schedules/3', () => {
      expect(api.getRunnerTrigger).toHaveBeenCalledWith(3)
      expect(api.listRunnerJobs).toHaveBeenCalledWith({ trigger_id: 3 }, { limit: 25 })
    }, 'tous les jours à 8 h'],
    ['/automations/schedules/3/settings', () => expect(api.getRunnerTrigger).toHaveBeenCalledWith(3), 'Horaire (cron)'],
    ['/automations/executions', () => expect(api.listRunnerJobs).toHaveBeenCalledWith({}, { limit: 25 }), '43'],
    ['/automations/executions/300', () => expect(api.getRunnerJob).toHaveBeenCalledWith(300), 'programmation #3'],
  ]

  it.each(PAGES)('%s', async (url, appels, attendu) => {
    servirMonde(bouchons)
    let m = await ouvrir(url)
    expect(m.router.currentRoute.value.fullPath).toBe(url)
    appels()
    expect(m.hote.textContent).toContain(attendu)
    expect(m.hote.querySelector('[role="alert"]')).toBeNull()

    effacer()
    m = await ouvrir(url)
    appels()
    expect(m.hote.textContent).toContain(attendu)
  })

  it('la navigation surligne la rubrique, le fil mène aux pages parentes, un onglet mène à sa liste', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/schedules/3/settings')
    expect(texte(m, '[data-test="navigation"] [aria-selected="true"]').trim()).toBe('Programmations')
    const fil = m.hote.querySelector('[data-test="fil"]')!
    expect([...fil.querySelectorAll('a')].map((a) => a.getAttribute('href')))
      .toEqual(['/automations', '/automations/schedules', '/automations/schedules/3'])
    expect(fil.textContent).toContain('Réglages')

    const onglets = m.hote.querySelectorAll('[data-test="navigation"] [role="tab"]')
    await naviguer(m.router, () => (onglets[2] as HTMLElement).click())
    expect(m.router.currentRoute.value.path).toBe('/automations/executions')
    expect(texte(m, '[data-test="navigation"] [aria-selected="true"]').trim()).toBe('Exécutions')
  })
})

describe('le retour navigateur garde filtres et pagination', () => {
  it('exécutions : suite déroulée, page d’une exécution, retour à la même lecture', async () => {
    const echecs = Array.from({ length: 60 }, (_, i) => travail({ id: 1000 + i, status: 'failed' }))
    servirMonde(bouchons, { file: [...echecs, ...FILE] })
    const m = await ouvrir('/automations/executions?status=failed')
    expect(api.listRunnerJobs).toHaveBeenLastCalledWith({ status: 'failed' }, { limit: 25 })
    expect(m.hote.textContent).toContain('25 affichés sur 71')

    await cliquer([...m.hote.querySelectorAll('button')].find((b) => b.textContent?.includes('Afficher la suite')))
    expect(m.router.currentRoute.value.query).toEqual({ status: 'failed', shown: '50' })

    await naviguer(m.router, () => (m.hote.querySelector('li[data-job="1040"] a') as HTMLElement).click())
    expect(m.router.currentRoute.value.path).toBe('/automations/executions/1040')
    expect(api.getRunnerJob).toHaveBeenCalledWith(1040)

    effacer()
    await naviguer(m.router, () => m.router.back())
    expect(m.router.currentRoute.value.fullPath).toBe('/automations/executions?status=failed&shown=50')
    expect(api.listRunnerJobs).toHaveBeenCalledWith({ status: 'failed' }, { limit: 50 })
    expect(m.hote.querySelectorAll('li[data-job]')).toHaveLength(50)
    expect(texte(m, '[aria-label="Statut"]')).toContain('en échec')
  })

  it('exécutions : un filtre est une entrée d’historique, le retour rend le précédent', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/executions?source=scheduled')
    expect(api.listRunnerJobs).toHaveBeenLastCalledWith({ source: 'scheduled' }, { limit: 25 })
    await naviguer(m.router, () => m.router.push('/automations/executions?source=manual&campaign=7'))
    expect(api.listRunnerJobs).toHaveBeenLastCalledWith({ source: 'manual', fleet_id: 7 }, { limit: 25 })
    effacer()
    await naviguer(m.router, () => m.router.back())
    expect(api.listRunnerJobs).toHaveBeenCalledWith({ source: 'scheduled' }, { limit: 25 })
    expect(m.hote.querySelectorAll('li[data-job]')).toHaveLength(2)
  })

  it('campagnes : le filtre de statut vit dans l’URL ; un inconnu se dit ignoré', async () => {
    const ilYaUneHeure = new Date(Date.now() - 3_600_000).toISOString().replace('T', ' ').slice(0, 19)
    servirMonde(bouchons, {
      fleets: [
        flotte({ id: 7, label: 'vivante' }),
        // Arrêtée IL Y A une heure, pas à une date fixe : passé `RECENTE_JOURS`, une campagne
        // arrêtée se replie hors du filtre, et une date écrite en dur a fait rougir le tronc
        // le 21/09/2026, sept jours après avoir été vraie.
        flotte({ id: 9, label: 'finie', status: 'stopped', stopped_at: ilYaUneHeure, stop_reason: 'fin' }),
      ],
    })
    const noms = (m: Monte) => [...m.hote.querySelectorAll('.cc-name')].map((n) => n.textContent)
    const m = await ouvrir('/automations/campaigns?status=stopped')
    expect(noms(m)).toEqual(['finie'])
    await naviguer(m.router, () => m.router.push('/automations/campaigns?status=live'))
    expect(noms(m)).toEqual(['vivante'])
    await naviguer(m.router, () => m.router.back())
    expect(noms(m)).toEqual(['finie'])

    const inconnu = await ouvrir('/automations/campaigns?status=running')
    expect(texte(inconnu, '[data-test="ignores"]')).toContain('status=running')
    expect(noms(inconnu)).toEqual(['vivante', 'finie'])
  })
})

describe('l’ancien `?run=` d’une ligne de tableau', () => {
  it('se résout : il mène à la page de l’exécution', async () => {
    servirMonde(bouchons, { file: [...FILE, travail({ id: 42, run_id: 'r1', status: 'claimed' })] })
    const m = await ouvrir('/automations?run=r1')
    expect(api.listRunnerJobs).toHaveBeenCalledWith({ status: 'claimed' }, { limit: 200 })
    expect(m.router.currentRoute.value.fullPath).toBe('/automations/executions/42')
    expect(api.getRunnerJob).toHaveBeenCalledWith(42)
  })

  it('ne se résout pas : l’entrée le dit, et reste l’entrée', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations?run=r9')
    expect(m.router.currentRoute.value.path).toBe('/automations')
    expect(texte(m, '[data-test="cible-run"]')).toContain('r9')
    expect(api.getRunnerJob).not.toHaveBeenCalled()
  })
})

describe('une adresse n’affiche que l’objet qu’elle désigne', () => {
  it.each([
    ['/automations/campaigns/abc', 'getRunnerFleet', 'Impossible d\'ouvrir la campagne « abc »'],
    ['/automations/schedules/0/settings', 'getRunnerTrigger', 'Impossible d\'ouvrir la programmation « 0 »'],
    ['/automations/executions/x1', 'getRunnerJob', 'Impossible d\'ouvrir l\'exécution « x1 »'],
  ] as const)('%s : aucune lecture, la page le dit', async (url, lecture, titre) => {
    servirMonde(bouchons)
    const m = await ouvrir(url)
    expect(api[lecture]).not.toHaveBeenCalled()
    expect(api.listRunnerJobs).not.toHaveBeenCalled()
    expect(m.hote.textContent).toContain(titre)
  })

  it('404 : le code du serveur, et rien à la place', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/campaigns/99')
    expect(texte(m, '[role="alert"]')).toContain('404 fleet_not_found')
    expect(api.getRunnerFleetState).not.toHaveBeenCalled()
    expect(api.listRunnerJobs).not.toHaveBeenCalled()
    expect(m.hote.querySelector('[data-test="identite"]')).toBeNull()
  })
})

describe('la bêta absente ne rougit rien', () => {
  it.each(['/automations', '/automations/campaigns', '/automations/campaigns/7', '/automations/executions'])(
    '%s', async (url) => {
      servirMonde(bouchons)
      const beta = new ApiError(403, 'beta_required', 'les passages d’agents sont en bêta')
      api.listRunnerFleets.mockRejectedValue(beta)
      api.getRunnerFleet.mockRejectedValue(beta)
      const m = await ouvrir(url)
      expect(m.hote.querySelector('[role="alert"]')).toBeNull()
      if (url === '/automations/executions') {
        // Sans campagne lisible, le filtre par campagne n'est pas offert.
        expect(m.hote.querySelector('[aria-label="Campagne"]')).toBeNull()
        expect(m.hote.querySelector('[aria-label="Statut"]')).not.toBeNull()
        expect(m.hote.querySelectorAll('li[data-job]').length).toBeGreaterThan(0)
      } else {
        expect(m.hote.textContent).toContain('Campagnes non activées pour cette organisation.')
      }
    })
})

describe('une erreur reste dans sa section', () => {
  it('entrée : campagnes illisibles ; runner, pertes, échecs et routines toujours là', async () => {
    servirMonde(bouchons, { triggers: [programmation({ expired_count: 2, expired_last: '2026-09-13 06:00:00' })] })
    api.listRunnerFleets.mockRejectedValue(new ApiError(500, 'boom'))
    const m = await ouvrir('/automations')
    expect(m.hote.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(texte(m, '[data-test="vivantes"]')).toContain('Campagnes illisibles')
    expect(m.hote.textContent).toContain('Un worker prend les exécutions de cette organisation.')
    expect(texte(m, '[data-test="en-perte"]')).toContain('Veille du matin')
    expect(texte(m, '[data-test="en-perte"]')).toContain('2 occurrences non prises')
    expect(texte(m, '[data-test="echecs"]')).toContain('#301')
    expect(m.hote.textContent).toContain('Routines Claude Code')
  })

  it('campagne : compteurs illisibles ; identité et historique toujours là', async () => {
    servirMonde(bouchons)
    api.getRunnerFleetState.mockRejectedValue(new ApiError(500, 'boom'))
    const m = await ouvrir('/automations/campaigns/7')
    expect(texte(m, '[role="alert"]')).toContain('Compteurs illisibles')
    expect(texte(m, '[data-test="identite"]')).toContain('relance-clients')
    expect(m.hote.querySelectorAll('[data-test="historique"] li[data-job]')).toHaveLength(25)
  })
})

describe('les routines Claude Code, sans routine', () => {
  it.each([
    ['fr', 'ajoute un trigger « API » (Add another trigger → API)'],
    ['en', 'add an “API” trigger (Add another trigger → API)'],
  ] as const)('%s : le chemin cite l’écran d’Anthropic, et ses deux liens restent des liens', async (langue, citation) => {
    i18n.global.locale.value = langue
    servirMonde(bouchons)
    const m = await ouvrir('/automations')
    const vide = m.hote.querySelector('[data-test="routines-vide"]')!
    expect(vide.textContent).toContain(citation)
    const liens = [...vide.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(liens).toEqual(['https://claude.ai/code/routines', '/connectors'])
  })
})

describe('les historiques paginent sous leur filtre serveur', () => {
  it('campagne : curseur sous `fleet_id`, pli porté par l’URL, rechargé à l’identique', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/campaigns/7')
    expect(texte(m, '[data-test="historique"]')).toContain('25 affichés sur 30')
    await cliquer([...m.hote.querySelectorAll('[data-test="historique"] button')]
      .find((b) => b.textContent?.includes('Afficher la suite')))
    expect(api.listRunnerJobs).toHaveBeenLastCalledWith({ fleet_id: 7 }, { limit: 25, cursor: '105' })
    expect(texte(m, '[data-test="historique"]')).toContain('30 affichés sur 30')
    expect(m.router.currentRoute.value.query).toEqual({ shown: '30' })

    effacer()
    const recharge = await ouvrir('/automations/campaigns/7?shown=30')
    expect(api.listRunnerJobs).toHaveBeenCalledWith({ fleet_id: 7 }, { limit: 30 })
    expect(recharge.hote.querySelectorAll('[data-test="historique"] li[data-job]')).toHaveLength(30)
  })

  it('programmation : sous `trigger_id`, seules ses exécutions', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/schedules/3')
    const ids = [...m.hote.querySelectorAll('[data-test="historique"] li[data-job]')].map((li) => li.getAttribute('data-job'))
    expect(ids).toEqual(['300'])
    expect(texte(m, '[data-test="historique"]')).toContain('1 affichés sur 1')
  })
})

describe('une programmation webhook se lit par ce qu’elle reçoit (oto#214)', () => {
  const livraison = (over: Record<string, unknown>) => ({
    id: 1, received_at: '2026-09-13 11:40:00', outcome: 'queued', job_id: 300, source: null,
    job_status: 'done', job_due_at: null, job_input: null, job_attempt_errors: [], ...over,
  })

  it('ni horaire ni prochaine exécution : son adresse, ses comptes, sa file et ses livraisons', async () => {
    servirMonde(bouchons, {
      triggers: [programmation(), webhook()],
      livraisons: [
        livraison({ id: 2, outcome: 'refused_secret', job_id: null, job_status: null, job_attempt_errors: null }),
        livraison({ id: 1, job_status: 'failed', job_attempt_errors: [{ attempt: 1, at: 'x', error: 'quota épuisé' }] }),
      ],
    })
    const m = await ouvrir('/automations/schedules/5')
    const apercu = texte(m, '[data-test="apercu"]')
    expect(apercu).not.toContain('horaire')
    expect(apercu).not.toContain('prochaine exécution')
    expect(texte(m, '[data-test="genre"]')).toContain('à chaque livraison de la source')
    expect(texte(m, '[data-test="recues"]')).toContain('12 livraisons sur 24 h, dont 1 refusée')
    expect(texte(m, '[data-test="file"]')).toContain('2 prêtes à partir, 0 retenues par la pause')
    // L'adresse est celle que le serveur compose, jamais reconstruite.
    expect(texte(m, '[data-test="adresse"]')).toContain('https://mcp.oto.cx/api/hooks/5')
    expect(api.listRunnerDeliveries).toHaveBeenCalledWith(5)
    const lignes = [...m.hote.querySelectorAll('[data-test="livraison"]')].map((li) => li.textContent ?? '')
    expect(lignes[0]).toContain('refusée : secret invalide')
    expect(lignes[1]).toContain('acceptée')
    expect(lignes[1]).toContain('en échec')
    expect(lignes[1]).toContain('1 tentative échouée — quota épuisé')
    expect(m.hote.querySelector('[data-test="livraison"] a[href="/automations/executions/300"]')).not.toBeNull()
  })

  it('un horaire ne lit pas de livraisons', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/schedules/3')
    expect(m.hote.querySelector('[data-test="livraisons"]')).toBeNull()
    expect(api.listRunnerDeliveries).not.toHaveBeenCalled()
  })

  it('dans la liste : son genre et ce qu’il a reçu, pas un cron', async () => {
    servirMonde(bouchons, { triggers: [webhook({ deliveries_24h: 0, deliveries_refused_24h: 0 })] })
    const m = await ouvrir('/automations/schedules')
    expect(texte(m, '[data-test="genre"]')).toBe('webhook')
    expect(texte(m, '[data-test="recues"]')).toContain('aucune livraison sur 24 h')
    expect(m.hote.textContent).not.toContain('Europe/Paris')
  })
})

describe('le suivi des exécutions se filtre par programmation (oto#214)', () => {
  it('le lien d’une programmation ouvre le suivi sous `trigger_id`, et l’URL le garde', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/schedules/3')
    await naviguer(m.router, () => cliquer(m.hote.querySelector('[data-test="vers-suivi"]')))
    expect(m.router.currentRoute.value.fullPath).toBe('/automations/executions?schedule=3')
    expect(api.listRunnerJobs).toHaveBeenLastCalledWith({ trigger_id: 3 }, { limit: 25 })
    const ids = [...m.hote.querySelectorAll('li[data-job]')].map((li) => li.getAttribute('data-job'))
    expect(ids).toEqual(['300'])
  })

  it('une programmation illisible dans l’URL se dit ignorée', async () => {
    servirMonde(bouchons)
    const m = await ouvrir('/automations/executions?schedule=abc')
    expect(texte(m, '[data-test="ignores"]')).toContain('schedule=abc')
  })
})
