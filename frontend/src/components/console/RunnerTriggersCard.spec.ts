// Un déclencheur qui PERD ses occurrences reste « vert » : il part à l'heure, et
// c'est au bout de la file que rien ne vient. Le backend compte ces pertes depuis le
// 01/09 (`expired_count`/`expired_since`/`expired_last`) — l'écran les dit
// « occurrences non prises » depuis oto#205.
//
// Ces tests tiennent les deux moitiés : la perte se voit, et l'absence de perte ne
// fabrique aucun bruit. Les réglages (lot 2) sont tenus par `automations/triggerRow.spec.ts`.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { RunnerTrigger } from '@/api/console'
import { ApiError } from '@/api'
import { i18n } from '@/lib/i18n'

const listRunnerTriggers = vi.fn()
const updateRunnerTrigger = vi.fn()
const deleteRunnerTrigger = vi.fn()
vi.mock('@/api/console', () => ({ listRunnerTriggers, updateRunnerTrigger, deleteRunnerTrigger }))
const me = { value: { sub: 'moi', role: 'member', org_role: 'org_member' } }
// Les helpers de rôle sont les VRAIS (oto#210) : seul le profil est un bouchon.
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me }),
}))

const BASE: RunnerTrigger = {
  id: 1, procedure: 'daily-brain', cron: '0 8 * * *', tz: 'Europe/Paris',
  tools: [], project_id: null, label: 'Ingestion du matin', enabled: true,
  next_due: '2026-09-04T06:00:00Z', max_steps: null, model: null,
  expired_count: null, expired_since: null, expired_last: null,
}

const vider = async () => {
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}

beforeEach(() => { i18n.global.locale.value = 'fr' })

async function monter(t: Partial<RunnerTrigger>, props: Record<string, unknown> = {}) {
  return (await monterAvec([{ ...BASE, ...t }], props)).textContent ?? ''
}

async function monterAvec(triggers: RunnerTrigger[], props: Record<string, unknown> = {}) {
  listRunnerTriggers.mockClear()
  listRunnerTriggers.mockResolvedValue({ triggers })
  const Card = (await import('./RunnerTriggersCard.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(Card, props)
  app.use(i18n)
  app.component('RouterLink', LIEN)
  app.mount(host)
  await vider()
  return host
}
const LIEN = { props: ['to'], template: '<a :href="to"><slot /></a>' }

describe('RunnerTriggersCard — les occurrences non prises (oto#41)', () => {
  it('affiche le compte ET les deux dates quand des occurrences n’ont pas été prises', async () => {
    const txt = await monter({
      expired_count: 41,
      expired_since: '2026-08-20T06:00:00Z',
      expired_last: '2026-09-02T06:00:00Z',
    })
    expect(txt).toContain('41 occurrences non prises')
    // Les DEUX dates : « depuis quand » et « est-ce encore en cours ».
    expect(txt).toContain('depuis')
    expect(txt).toContain('dernière')
  })

  it('ne dit RIEN quand rien n’a été perdu — zéro est un vrai zéro', async () => {
    const txt = await monter({ expired_count: 0, expired_since: null, expired_last: null })
    expect(txt).not.toContain('non prise')
  })

  it('ne dit rien non plus quand le serveur ne mesure pas (champ absent)', async () => {
    const txt = await monter({ expired_count: null })
    expect(txt).not.toContain('non prise')
  })

  it('accorde le pluriel — une perte unique ne s’annonce pas au pluriel', async () => {
    const txt = await monter({ expired_count: 1, expired_since: '2026-09-02T06:00:00Z' })
    expect(txt).toContain('1 occurrence non prise')
    // (la phrase d'explication dit « les occurrences en attente » : on vise le compte)
    expect(txt).not.toContain('occurrences non prises')
  })

  it('dit la prochaine exécution d’un déclencheur allumé', async () => {
    const txt = await monter({})
    expect(txt).toContain('prochaine exécution : 2026-09-04 06:00')
  })
})

describe('RunnerTriggersCard — montée sur une procédure (#860 ①)', () => {
  it('demande au SERVEUR les déclencheurs de cette procédure, pas ceux de l’org', async () => {
    await monterAvec([BASE], { procedure: 'daily-brain' })
    expect(listRunnerTriggers).toHaveBeenCalledWith('daily-brain')
  })

  it('sans procédure, demande l’org entière', async () => {
    await monterAvec([BASE])
    expect(listRunnerTriggers).toHaveBeenCalledWith(undefined)
  })

  it('dit qu’elle ne tourne pas toute seule, pas « aucun déclencheur »', async () => {
    const host = await monterAvec([], { procedure: 'daily-brain' })
    expect(host.textContent).toContain('ne tourne pas toute seule')
  })

  it('offre les mêmes gestes que sur la page : c’est le même composant', async () => {
    const host = await monterAvec([BASE], { procedure: 'daily-brain' })
    expect(host.querySelector('[data-test="interrupteur"]')).not.toBeNull()
    expect(host.querySelector('[data-test="regler"]')).not.toBeNull()
    expect(host.querySelector('[data-test="supprimer"]')).not.toBeNull()
  })
})

describe('RunnerTriggersCard — ce que l’arrêt fait (#860 ④)', () => {
  it('dit que couper périme les occurrences en attente, et que rallumer ne rattrape pas', async () => {
    const host = await monterAvec([BASE])
    expect(host.textContent).toContain('périme les occurrences en attente')
    expect(host.textContent).toContain("n'est pas rattrapée")
  })

  it('ne l’écrit pas quand il n’y a aucun déclencheur — rien à expliquer', async () => {
    const host = await monterAvec([])
    expect(host.textContent).not.toContain('périme les occurrences')
  })
})

describe('RunnerTriggersCard — l’erreur d’un interrupteur (oto#205)', () => {
  it('reste sur SON déclencheur, se lit telle que le serveur l’a écrite, et s’efface au geste suivant réussi', async () => {
    const autre: RunnerTrigger = { ...BASE, id: 2, label: 'Relance du soir' }
    const host = await monterAvec([BASE, autre])
    const detail = "aucun runner armé pour cette org (aucun worker n'a jamais sondé la file de cette org : rien n'exécuterait ce déclencheur)."
    updateRunnerTrigger.mockRejectedValueOnce(new ApiError(400, 'no_runner_armed', detail))

    const interrupteur = () => host.querySelectorAll('li')[0]!.querySelector('[data-test="interrupteur"]') as HTMLButtonElement
    interrupteur().click()
    await vider()
    const lignes = [...host.querySelectorAll('li')]
    expect(lignes).toHaveLength(2)
    const alerte = lignes[0]!.querySelector('[role="alert"]')?.textContent ?? ''
    expect(alerte).toContain(`Refusé : ${detail}`)
    expect(alerte).toContain('no_runner_armed')
    expect(alerte).not.toContain('400 no_runner_armed')
    expect(lignes[1]!.querySelector('[role="alert"]')).toBeNull()
    expect(host.textContent).toContain('Relance du soir')

    updateRunnerTrigger.mockResolvedValueOnce({ trigger: { ...BASE, enabled: false } })
    interrupteur().click()
    await vider()
    expect(updateRunnerTrigger).toHaveBeenLastCalledWith(1, { enabled: false })
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  // La présence du runner ne remonte plus de la carte : l'entrée de l'espace la lit elle-même,
  // en une lecture (`useProgrammations`, oto#214). La carte mène à la page de chaque ligne.
  it('le nom d’une ligne mène à la page de sa programmation, par son identifiant', async () => {
    const host = await monterAvec([{ ...BASE, id: 12 }])
    const lien = host.querySelector('[data-test="page-programmation"]')
    expect(lien?.getAttribute('href')).toBe('/automations/schedules/12')
    expect(lien?.textContent).toContain('Ingestion du matin')
  })
})
