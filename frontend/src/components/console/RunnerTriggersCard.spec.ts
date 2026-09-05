// Un déclencheur qui PERD ses occurrences reste « vert » : il part à l'heure, et
// c'est au bout de la file que rien ne vient. Le backend compte ces pertes depuis le
// 01/09 (`expired_count`/`expired_since`/`expired_last`) et rien ne les affichait —
// quarante-et-une occurrences empilées sur treize jours n'ont été découvertes que par
// hasard, le 02/09, en préparant autre chose.
//
// Ces tests tiennent les deux moitiés : la perte se voit, et l'absence de perte ne
// fabrique aucun bruit.
import { describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { RunnerTrigger } from '@/api/console'

const listRunnerTriggers = vi.fn()
const setRunnerTriggerEnabled = vi.fn()
vi.mock('@/api/console', () => ({ listRunnerTriggers, setRunnerTriggerEnabled }))

const BASE: RunnerTrigger = {
  id: 1, procedure: 'daily-brain', cron: '0 8 * * *', tz: 'Europe/Paris',
  tools: [], project_id: null, label: 'Ingestion du matin', enabled: true,
  next_due: '2026-09-04T06:00:00Z', max_steps: null,
  expired_count: null, expired_since: null, expired_last: null,
}

async function monter(t: Partial<RunnerTrigger>, props: Record<string, unknown> = {}) {
  listRunnerTriggers.mockResolvedValue({ triggers: [{ ...BASE, ...t }] })
  return await monterAvec([{ ...BASE, ...t }], props)
}

async function monterAvec(triggers: RunnerTrigger[], props: Record<string, unknown> = {}) {
  listRunnerTriggers.mockClear()
  listRunnerTriggers.mockResolvedValue({ triggers })
  const Card = (await import('./RunnerTriggersCard.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  createApp(Card, props).mount(host)
  await nextTick(); await nextTick(); await nextTick()
  return host.textContent ?? ''
}

describe('RunnerTriggersCard — les occurrences perdues (oto#41)', () => {
  it('affiche le compte ET les deux dates quand des occurrences ont été perdues', async () => {
    const txt = await monter({
      expired_count: 41,
      expired_since: '2026-08-20T06:00:00Z',
      expired_last: '2026-09-02T06:00:00Z',
    })
    expect(txt).toContain('41')
    expect(txt).toContain('perdue')
    // Les DEUX dates : « depuis quand » et « est-ce encore en cours » sont deux
    // questions différentes. Une seule date les confondrait — une perte ancienne
    // qui a cessé n'appelle pas le même geste qu'une perte de ce matin.
    expect(txt).toContain('depuis')
    expect(txt).toContain('dernière')
  })

  it('ne dit RIEN quand rien n’a été perdu — zéro est un vrai zéro', async () => {
    const txt = await monter({ expired_count: 0, expired_since: null, expired_last: null })
    expect(txt).not.toContain('perdue')
  })

  it('ne dit rien non plus quand le serveur ne mesure pas (champ absent)', async () => {
    const txt = await monter({ expired_count: null })
    expect(txt).not.toContain('perdue')
  })

  it('accorde le pluriel — une perte unique ne s’annonce pas au pluriel', async () => {
    const txt = await monter({ expired_count: 1, expired_since: '2026-09-02T06:00:00Z' })
    expect(txt).toContain('1 perdue')
    expect(txt).not.toContain('perdues')
  })
})


// L'écran d'une procédure demande « CELLE-CI tourne-t-elle ? », pas la liste de
// l'org (#860 ①). Le filtre doit être SERVEUR : filtrer côté client devient faux dès
// qu'il y a plus d'une page de déclencheurs, et le silence d'une page manquante se
// lit « elle ne tourne pas » — la pire des réponses, puisqu'elle fait poser un
// second agent programmé sur un objet qui en a déjà un.
describe('RunnerTriggersCard — montée sur une procédure (#860 ①)', () => {
  it('demande au SERVEUR les déclencheurs de cette procédure, pas ceux de l’org', async () => {
    await monterAvec([BASE], { procedure: 'daily-brain' })
    expect(listRunnerTriggers).toHaveBeenCalledWith('daily-brain')
  })

  it('sans procédure, demande l’org entière — la page Automatisations ne change pas', async () => {
    await monterAvec([BASE])
    expect(listRunnerTriggers).toHaveBeenCalledWith(undefined)
  })

  it('dit qu’elle ne tourne pas toute seule, pas « aucun déclencheur »', async () => {
    const txt = await monterAvec([], { procedure: 'daily-brain' })
    expect(txt).toContain('ne tourne pas toute seule')
  })
})

// #860 ④ — ce que l'interrupteur fait doit être écrit, sinon le comportement
// surprend : couper périme ce qui attend, et rallumer ne rattrape pas l'échéance
// manquée (`efa0cebc`, #826). Dire l'inverse — ou ne rien dire — laisse quelqu'un
// couper en croyant mettre en pause.
describe('RunnerTriggersCard — ce que l’arrêt fait (#860 ④)', () => {
  it('dit que couper périme les occurrences en attente', async () => {
    const txt = await monterAvec([BASE], { procedure: 'daily-brain' })
    expect(txt).toContain('périme les occurrences en attente')
  })

  it('dit que rallumer ne rattrape PAS l’échéance manquée', async () => {
    const txt = await monterAvec([BASE])
    expect(txt).toContain("n'est pas rattrapée")
  })

  it('ne l’écrit pas quand il n’y a aucun déclencheur — rien à expliquer', async () => {
    const txt = await monterAvec([])
    expect(txt).not.toContain('périme les occurrences')
  })
})
