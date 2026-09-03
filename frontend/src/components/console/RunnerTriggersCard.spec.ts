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

async function monter(t: Partial<RunnerTrigger>) {
  listRunnerTriggers.mockResolvedValue({ triggers: [{ ...BASE, ...t }] })
  const Card = (await import('./RunnerTriggersCard.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  createApp(Card).mount(host)
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
