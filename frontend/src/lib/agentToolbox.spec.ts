// Les dérivations de `GET /api/me/agent-toolbox` (oto#166) : les raisons dites au membre
// sont gravées ici, une ligne par valeur servie ; et les deux pièges du schéma —
// `available: false` n'est pas un zéro, `tools_total` n'est pas ce que voit l'agent.
import { describe, expect, it } from 'vitest'
import { notSeenByName, seenCounts, unseenReason } from './agentToolbox'

describe('installé mais invisible — la raison que lit le membre', () => {
  it.each([
    ['cut', 'coupé pour ton organisation'],
    ['restricted', 'réservé à certaines équipes'],
    ['no_tools', 'aucun outil chargé'],
    ['paused', null],
  ] as const)('reason=%s → %s', (reason, list) => {
    expect(unseenReason(reason)?.list ?? null).toBe(list)
  })

  it('en solo, « coupé » sans prononcer l\'organisation', () => {
    expect(unseenReason('cut', { isPersonal: true })?.list).toBe('coupé')
  })
})

describe('vue non dérivable — ni zéro, ni invisibles', () => {
  it('seenCounts rend null, pas 0', () => {
    expect(seenCounts({ available: false })).toBeNull()
  })
  it('notSeenByName rend une carte vide', () => {
    expect(notSeenByName({ available: false }).size).toBe(0)
  })
  it('tools_total ne compte jamais comme visible', () => {
    expect(seenCounts({ available: true, tools: ['a'], tools_total: 99, connectors: [], installed_not_seen: [] })?.tools).toBe(1)
  })
})
