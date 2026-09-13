// Ce que l'écran des campagnes DIT d'un statut (oto#205). Les règles viennent de la
// session flotte : `armed` est une intention, `running` un fait, `stopping` une demande,
// et une flotte `draft` qui porte des travaux est un historique de l'ancien ordonnanceur.
import { describe, it, expect, beforeEach } from 'vitest'
import type { RunnerFleet, RunnerFleetState } from '@/types/api'
import { i18n } from '@/lib/i18n'
import {
  ARMEE_SANS_TRAVAIL_MS, STATUTS_VIVANTS, armeeSansTravail, compteurs, estVivante, jetons,
  libelleCampagne, repartir,
} from './runnerFleets'

function flotte(over: Partial<RunnerFleet> = {}): RunnerFleet {
  return {
    id: 1, label: 'relance', procedure: 'p', namespace: 'clients', status: 'draft',
    stop_reason: null, armed_at: null, started_at: null, stopping_at: null,
    heartbeat_at: null, stopped_at: null, created_at: null, model: null,
    ...over,
  } as RunnerFleet
}

function etat(over: Partial<RunnerFleetState> = {}): RunnerFleetState {
  return {
    jobs_total: 0, pending: 0, claimed: 0, done: 0, failed: 0, abandoned: 0,
    usage_tokens: 0, heaviest_row_tokens: null, last_finished: null, no_jobs_attached: true,
    ...over,
  }
}

const T0 = Date.parse('2026-09-13T12:00:00Z')
const dit = (l: { cle: string; params: Record<string, string | number> }) =>
  i18n.global.t(l.cle, l.params)

beforeEach(() => { i18n.global.locale.value = 'fr' })

describe('statut d’une campagne → libellé', () => {
  const SANS = etat()
  const AVEC = etat({ jobs_total: 40, done: 38, claimed: 2, no_jobs_attached: false })

  const TABLE: Array<[string, Partial<RunnerFleet>, RunnerFleetState | null, string]> = [
    ['draft sans travail', { status: 'draft' }, SANS, 'brouillon'],
    ['draft AVEC travaux — jamais « brouillon »', { status: 'draft' }, AVEC, 'historique'],
    ['draft dont l’état n’est pas encore lu', { status: 'draft' }, null, 'non armée'],
    ['armed sans travail — jamais « en cours »', { status: 'armed' }, SANS, 'armée, en attente de la première exécution'],
    ['running', { status: 'running' }, AVEC, 'en cours'],
    ['stopping — jamais « arrêtée », avec les travaux en vol', { status: 'stopping' }, AVEC, 'arrêt demandé, 2 en vol'],
    ['stopping dont l’état n’est pas lu', { status: 'stopping' }, null, 'arrêt demandé'],
    ['stopped, avec son motif', { status: 'stopped', stop_reason: 'max_rows' }, AVEC, 'arrêtée : max_rows'],
    ['stopped sans motif écrit', { status: 'stopped' }, AVEC, 'arrêtée, sans motif écrit'],
    ['done (inatteignable, libellé quand même)', { status: 'done' }, AVEC, 'terminée'],
    ['failed (inatteignable, libellé quand même)', { status: 'failed' }, AVEC, 'en échec'],
    ['un statut inconnu se montre tel quel', { status: 'paused' }, null, 'statut inconnu : paused'],
    ['un statut absent se dit inconnu', { status: null }, null, 'statut inconnu : —'],
  ]

  it.each(TABLE)('%s', (_, f, e, attendu) => {
    expect(dit(libelleCampagne(flotte(f), e))).toBe(attendu)
  })

  it('couvre les 7 statuts du backend', () => {
    const couverts = new Set(TABLE.map(([, f]) => f.status))
    for (const s of ['draft', 'armed', 'running', 'stopping', 'stopped', 'done', 'failed']) {
      expect(couverts.has(s)).toBe(true)
    }
  })

  it('chaque libellé existe en français ET en anglais', () => {
    for (const [, f, e] of TABLE) {
      const { cle } = libelleCampagne(flotte(f), e)
      expect(i18n.global.te(cle, 'fr'), cle).toBe(true)
      expect(i18n.global.te(cle, 'en'), cle).toBe(true)
    }
  })

  it('le battement n’entre dans aucun libellé — « ne bat plus » a disparu', () => {
    const vieux = flotte({ status: 'running', heartbeat_at: '2026-08-01 00:00:00' })
    const frais = flotte({ status: 'running', heartbeat_at: '2026-09-13 11:59:59' })
    expect(libelleCampagne(vieux, null)).toEqual(libelleCampagne(frais, null))
  })
})

describe('armée sans premier travail', () => {
  it('au-delà d’une minute, rend depuis combien de temps', () => {
    const f = flotte({ status: 'armed', armed_at: '2026-09-13 11:58:00' })
    expect(armeeSansTravail(f, T0)).toBe(2 * 60_000)
  })

  it('en deçà d’une minute, se tait : le premier travail arrive d’ordinaire en secondes', () => {
    const f = flotte({ status: 'armed', armed_at: '2026-09-13 11:59:30' })
    expect(armeeSansTravail(f, T0)).toBeNull()
    expect(ARMEE_SANS_TRAVAIL_MS).toBe(60_000)
  })

  it('n’invente pas l’heure d’armement quand elle n’est pas servie', () => {
    expect(armeeSansTravail(flotte({ status: 'armed', armed_at: null }), T0)).toBeNull()
  })

  it('ne concerne que `armed` : une campagne en cours a déjà produit', () => {
    const f = flotte({ status: 'running', armed_at: '2026-09-13 10:00:00' })
    expect(armeeSansTravail(f, T0)).toBeNull()
  })
})

describe('ordre et repli', () => {
  it('les vivantes d’abord, puis les récentes, puis les anciennes', () => {
    const r = repartir([
      flotte({ id: 1, status: 'draft', created_at: '2026-08-01 10:00:00' }),
      flotte({ id: 2, status: 'stopped', stopped_at: '2026-09-12 10:00:00' }),
      flotte({ id: 3, status: 'running', started_at: '2026-09-13 08:00:00' }),
      flotte({ id: 4, status: 'armed', armed_at: '2026-09-13 11:00:00' }),
      flotte({ id: 5, status: 'stopping', stopping_at: '2026-09-13 11:30:00' }),
      flotte({ id: 6, status: 'draft' }),
    ], T0)
    expect(r.vivantes.map((f) => f.id)).toEqual([5, 4, 3])
    expect(r.recentes.map((f) => f.id)).toEqual([2])
    // Sans date lisible, on ne prétend pas qu'elle est récente.
    expect(r.anciennes.map((f) => f.id)).toEqual([1, 6])
  })

  it('un battement récent ne rend pas récente une campagne ancienne', () => {
    const r = repartir([flotte({
      status: 'draft', created_at: '2026-07-01 00:00:00', heartbeat_at: '2026-09-13 11:00:00',
    })], T0)
    expect(r.anciennes).toHaveLength(1)
  })

  it('les trois statuts vivants', () => {
    expect([...STATUTS_VIVANTS]).toEqual(['armed', 'running', 'stopping'])
    expect(estVivante(flotte({ status: 'stopped' }))).toBe(false)
  })
})

describe('compteurs de toute la campagne', () => {
  it('rend les compteurs servis, et `abandoned` à part — c’est un sous-ensemble de `failed`', () => {
    const c = compteurs(etat({ done: 1790, pending: 12, claimed: 3, failed: 35, abandoned: 4 }))
    expect(c.map((x) => [x.cle, x.n])).toEqual([
      ['done', 1790], ['pending', 12], ['claimed', 3], ['failed', 35], ['abandoned', 4],
    ])
    expect(i18n.global.t('automations.campaign.counters.abandoned')).toBe('dont abandonnées')
  })
})

describe('les jetons, jamais la monnaie', () => {
  it('rend des jetons lisibles', () => {
    expect(jetons(950)).toBe('950')
    expect(jetons(12_400)).toBe('12 k')
    expect(jetons(3_500_000)).toBe('3.5 M')
  })

  it('⚠️ l’absence rend null, PAS « 0 » ; un vrai zéro, lui, s’affiche', () => {
    expect(jetons(null)).toBeNull()
    expect(jetons(undefined)).toBeNull()
    expect(jetons(Number.NaN)).toBeNull()
    expect(jetons(0)).toBe('0')
  })
})
