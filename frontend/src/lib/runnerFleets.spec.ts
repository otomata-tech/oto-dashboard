import { describe, it, expect } from 'vitest'
import type { RunnerFleet, RunnerFleetState } from '@/types/api.attendu'
import { RESIDU_MS, estResidu, jetons, ton, ditLeVide } from './runnerFleets'

function flotte(over: Partial<RunnerFleet> = {}): RunnerFleet {
  return {
    id: 1, label: 'passage', procedure: 'p', namespace: 'ns', row_filter: null,
    provider: null, model: null, tools: null, workers: null, max_rows: null,
    max_tokens: null, max_tokens_per_row: null, max_consecutive_failures: null,
    status: 'running', stop_reason: null, started_at: null, heartbeat_at: null,
    stopped_at: null, created_at: null, ...over,
  }
}

const T0 = Date.parse('2026-09-01T12:00:00Z')

describe('le VIVANT et le RÉSIDU', () => {
  it('un passage qui bat à l’instant est vivant', () => {
    const f = flotte({ heartbeat_at: '2026-09-01T11:59:00Z' })
    expect(estResidu(f, T0)).toBe(false)
  })

  it('un passage `running` qui ne bat plus depuis 10 min est un RÉSIDU', () => {
    const f = flotte({ heartbeat_at: '2026-09-01T11:49:00Z' })
    expect(estResidu(f, T0)).toBe(true)
  })

  it('⚠️ un `running` SANS battement compte comme résidu, pas comme vivant', () => {
    // Une flotte qui bat écrit son battement. Ne rien avoir écrit n'est pas
    // rassurant : le traiter comme vivant ferait attendre indéfiniment un
    // passage mort, et c'est ce qui fabrique l'habitude de désarmer à la main.
    expect(estResidu(flotte({ heartbeat_at: null }), T0)).toBe(true)
  })

  it('un battement illisible ne certifie pas « vivant »', () => {
    expect(estResidu(flotte({ heartbeat_at: 'pas-une-date' }), T0)).toBe(true)
  })

  it('un passage arrêté n’est jamais un résidu — il est arrêté, c’est tout', () => {
    for (const status of ['stopped', 'done', 'failed', 'draft']) {
      expect(estResidu(flotte({ status, heartbeat_at: null }), T0)).toBe(false)
    }
  })

  it('la borne est bien à 10 minutes', () => {
    expect(RESIDU_MS).toBe(600_000)
  })
})

describe('les jetons, jamais la monnaie', () => {
  it('rend des jetons lisibles', () => {
    expect(jetons(950)).toBe('950')
    expect(jetons(12_400)).toBe('12 k')
    expect(jetons(3_500_000)).toBe('3.5 M')
  })

  it('⚠️ l’absence rend null, PAS « 0 »', () => {
    // On n'écrit pas un zéro là où on ne sait pas : un zéro affiché se lit
    // « rien consommé », alors qu'il peut vouloir dire « rien mesuré ».
    expect(jetons(null)).toBeNull()
    expect(jetons(undefined)).toBeNull()
    expect(jetons(Number.NaN)).toBeNull()
  })

  it('un vrai zéro, lui, s’affiche', () => {
    expect(jetons(0)).toBe('0')
  })
})

describe('le vide se DIT', () => {
  const etat = (over: Partial<RunnerFleetState> = {}): RunnerFleetState =>
    ({ jobs_total: 0, no_jobs_attached: true, ...over })

  it('un passage sans travail rattaché est signalé comme tel', () => {
    expect(ditLeVide(etat())).toBe(true)
  })

  it('⚠️ un passage AVEC des travaux ne le dit pas, même si tout est à zéro', () => {
    // La distinction que l'écran doit rendre : « aucun travail rattaché » et
    // « des travaux, tous à zéro » sont deux situations opposées.
    expect(ditLeVide(etat({ jobs_total: 5, no_jobs_attached: false }))).toBe(false)
  })

  it('un état non chargé n’affirme rien', () => {
    expect(ditLeVide(null)).toBe(false)
  })
})

describe('les tons', () => {
  it('chaque état connu a son ton, et un état inconnu ne casse rien', () => {
    expect(ton(flotte({ status: 'running' }))).toBe('olive')
    expect(ton(flotte({ status: 'failed' }))).toBe('terra')
    expect(ton(flotte({ status: 'un-etat-que-le-serveur-ajoutera' }))).toBe('ink')
    expect(ton(flotte({ status: null }))).toBe('ink')
  })
})
