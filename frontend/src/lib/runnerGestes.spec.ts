// La table des gestes d'une campagne (oto#205, lot 2) : statut × état lu × droits.
// Chaque ligne est un cas que la session flotte a tranché sur le tronc ; un changement de
// règle se lit ici comme une ligne qui change, pas comme un composant qui bouge.
// Puis ce qu'un formulaire de déclencheur envoie.
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api'
import type { RunnerTrigger } from '@/api/console'
import type { RunnerFleet, RunnerFleetState } from '@/types/api'
import {
  apresReglage, borneAtteinte, champsModifies, droits, fuseauxProposes, fusionnerLecture,
  gestesCampagne, modeleDeclencheur, MOTIF_ECHECS_CONSECUTIFS, optionsModele, refusServi,
  reglageInitial, type Droits, type Empechement, type GesteCampagne,
} from './runnerGestes'

const ADMIN = droits({ role: 'member', org_role: 'org_admin' })
const MEMBRE = droits({ role: 'member', org_role: 'org_member' })
const LECTURE = droits({ role: 'super_admin', org_role: null, active_org_readonly: true })

const ETAT: RunnerFleetState = {
  jobs_total: 12, pending: 0, claimed: 0, done: 12, failed: 0, abandoned: 0,
  runs_by_outcome: null, rows: null, rows_unavailable: null,
  empty_jobs: 0, stopped_after_write: 0, reservation_unmeasured: 0,
  usage_tokens: 30_000, heaviest_row_tokens: 4_000, usage_unknown: 0,
  reservable_rows: 0, reservable_rows_unavailable: null, last_finished: '2026-09-13 10:00:00',
  no_jobs_attached: false,
}
const VIERGE: RunnerFleetState = { ...ETAT, jobs_total: 0, done: 0, no_jobs_attached: true }
const f = (status: string, over: Partial<Pick<RunnerFleet, 'stop_reason' | 'max_rows'>> = {}) =>
  ({ status, stop_reason: null, max_rows: null, ...over })

describe('droits — la parité avec `roles.is_org_admin`', () => {
  it('l’org_admin et le super_admin arment', () => {
    expect(droits({ role: 'member', org_role: 'org_admin' }).armer).toBe(true)
    expect(droits({ role: 'super_admin', org_role: null }).armer).toBe(true)
  })

  it('l’admin plateforme n’arme PAS : le serveur le refuse (oto#210)', () => {
    expect(droits({ role: 'admin', org_role: null }).armer).toBe(false)
    expect(droits({ role: 'admin', org_role: 'org_member' })).toEqual({ ouverts: true, armer: false })
  })

  it('en lecture seule, rien — pas même pour un org_admin', () => {
    expect(droits({ role: 'member', org_role: 'org_admin', active_org_readonly: true }))
      .toEqual({ ouverts: false, armer: false })
  })

  it('sans profil chargé, rien', () => {
    expect(droits(null)).toEqual({ ouverts: false, armer: false })
  })
})

describe('gestesCampagne — statut × état × droits', () => {
  const cas: [string, ReturnType<typeof f>, RunnerFleetState | null, Droits, GesteCampagne[], Empechement | null][] = [
    ['draft non lu : brouillon ou historique, on ne sait pas', f('draft'), null, ADMIN, [], null],
    ['draft vierge, admin', f('draft'), VIERGE, ADMIN, ['armer'], null],
    ['draft vierge, membre : pas de bouton grisé', f('draft'), VIERGE, MEMBRE, [], null],
    ['draft historique, admin : levier nommé', f('draft'), ETAT, ADMIN, [], 'historique'],
    ['draft historique, membre', f('draft'), ETAT, MEMBRE, [], null],
    ['armed, membre', f('armed'), null, MEMBRE, ['arreter'], null],
    ['running, admin', f('running'), ETAT, ADMIN, ['arreter'], null],
    ['stopping, admin : on attend', f('stopping'), ETAT, ADMIN, [], null],
    ['stopping, membre', f('stopping'), ETAT, MEMBRE, [], null],
    ['stopped, admin', f('stopped', { stop_reason: 'arrêt demandé' }), ETAT, ADMIN, ['relancer'], null],
    ['stopped non lu, admin : la borne n’est pas encore lisible', f('stopped'), null, ADMIN, [], null],
    ['stopped, membre', f('stopped'), ETAT, MEMBRE, [], null],
    ['done, admin', f('done'), ETAT, ADMIN, ['relancer'], null],
    ['failed, admin', f('failed'), ETAT, ADMIN, ['relancer'], null],
    ['R1 : borne atteinte', f('stopped', { max_rows: 12 }), ETAT, ADMIN, [], 'borneAtteinte'],
    ['R1 : borne dépassée', f('stopped', { max_rows: 10 }), ETAT, ADMIN, [], 'borneAtteinte'],
    ['borne pas encore atteinte', f('stopped', { max_rows: 13 }), ETAT, ADMIN, ['relancer'], null],
    ['R2 : arrêtée pour échecs consécutifs', f('stopped', { stop_reason: MOTIF_ECHECS_CONSECUTIFS }), ETAT, ADMIN, [], 'echecsConsecutifs'],
    ['R2 vu par un membre : rien à dire', f('stopped', { stop_reason: MOTIF_ECHECS_CONSECUTIFS }), ETAT, MEMBRE, [], null],
    // Aucune heuristique sur le texte : seule la constante écrite par le serveur compte.
    ['un motif libre qui en parle n’est pas R2', f('stopped', { stop_reason: 'trop d’échecs consécutifs' }), ETAT, ADMIN, ['relancer'], null],
    ['statut inconnu', f('paused'), ETAT, ADMIN, [], null],
    ['lecture seule, running', f('running'), ETAT, LECTURE, [], null],
    ['lecture seule, stopped', f('stopped'), ETAT, LECTURE, [], null],
  ]
  it.each(cas)('%s', (_nom, flotte, etat, d, gestes, empechement) => {
    expect(gestesCampagne(flotte, etat, d)).toEqual({ gestes, empechement })
  })

  it('le motif R2 est la valeur que le serveur écrit', () => {
    expect(MOTIF_ECHECS_CONSECUTIFS).toBe('max_consecutive_failures')
  })

  it('sans borne déclarée, jamais atteinte', () => {
    expect(borneAtteinte({ max_rows: null }, { jobs_total: 1_000_000 })).toBe(false)
  })
})

describe('fusionnerLecture', () => {
  const x = (id: number, status: string) => ({ id, status } as RunnerFleet)

  it('une campagne écrite après le départ de la lecture garde l’état affiché', () => {
    const affichees = [x(1, 'armed'), x(2, 'running')]
    const lues = [x(1, 'stopped'), x(2, 'stopping'), x(3, 'draft')]
    expect(fusionnerLecture(affichees, lues, (id) => id === 1))
      .toEqual([x(1, 'armed'), x(2, 'stopping'), x(3, 'draft')])
  })

  it('une disparition servie reste une disparition', () => {
    expect(fusionnerLecture([x(1, 'armed')], [], () => true)).toEqual([])
  })
})

describe('refusServi', () => {
  it('le détail du serveur mot pour mot, et son code', () => {
    const detail = "ce passage est `running` — on n'arme que ce qui ne tourne pas."
    expect(refusServi(new ApiError(409, 'not_launchable', detail)))
      .toEqual({ code: 'not_launchable', texte: detail })
  })

  it('sans réponse du serveur, pas de code inventé', () => {
    expect(refusServi(new Error('Failed to fetch'))).toEqual({ code: null, texte: 'Failed to fetch' })
  })
})

describe('déclencheurs — ce que le formulaire envoie', () => {
  const T = { cron: '0 8 * * *', tz: 'Europe/Paris', model: null }
  const CATALOGUE = [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', served: true },
    { id: 'claude-opus', label: 'Claude Opus', served: true },
    { id: 'mistral-large', label: 'Mistral Large', served: false },
  ]

  it('sans modèle déclaré, le réglage part de « modèle du worker », jamais du défaut', () => {
    expect(reglageInitial(T)).toEqual({ cron: '0 8 * * *', tz: 'Europe/Paris', model: '' })
  })

  it('seuls les champs modifiés', () => {
    const i = reglageInitial(T)
    expect(champsModifies(i, { ...i })).toEqual({})
    expect(champsModifies(i, { ...i, cron: ' 0 8 * * * ' })).toEqual({})
    expect(champsModifies(i, { ...i, tz: 'UTC' })).toEqual({ tz: 'UTC' })
    expect(champsModifies(i, { ...i, cron: ' 0 9 * * *', model: 'claude-opus' }))
      .toEqual({ cron: '0 9 * * *', model: 'claude-opus' })
  })

  it('revenir au modèle du worker envoie `""`', () => {
    const i = reglageInitial({ ...T, model: 'mistral-large' })
    expect(champsModifies(i, { ...i, model: '' })).toEqual({ model: '' })
  })

  it('après un réglage, la réponse fait foi et ce qui a été perdu survit', () => {
    const courant: RunnerTrigger = {
      id: 1, procedure: 'veille', cron: '0 8 * * *', tz: 'Europe/Paris', tools: [], project_id: null,
      label: null, enabled: true, next_due: '2026-09-14T06:00:00Z', max_steps: null, model: null,
      expired_count: 41, expired_since: '2026-08-20T06:00:00Z', expired_last: '2026-09-02T06:00:00Z',
    }
    const rendu = { ...courant, cron: '0 9 * * *', next_due: '2026-09-14T07:00:00Z',
      expired_count: null, expired_since: null, expired_last: null }
    expect(apresReglage(courant, rendu)).toEqual({ ...rendu, expired_count: 41,
      expired_since: '2026-08-20T06:00:00Z', expired_last: '2026-09-02T06:00:00Z' })
  })

  it('les modèles proposés : les servis ; le courant non servi ajouté et marqué', () => {
    expect(optionsModele(CATALOGUE, '').map((o) => o.value)).toEqual(['claude-sonnet-4-5', 'claude-opus'])
    expect(optionsModele(CATALOGUE, 'mistral-large').at(-1))
      .toEqual({ value: 'mistral-large', label: 'Mistral Large', nonServi: true })
    expect(optionsModele(CATALOGUE, 'claude-opus')).toHaveLength(2)
  })

  it('le modèle d’une ligne : sans catalogue lu, on ne marque rien', () => {
    expect(modeleDeclencheur(null, CATALOGUE)).toEqual({ label: null, nonServi: false })
    expect(modeleDeclencheur('mistral-large', CATALOGUE)).toEqual({ label: 'Mistral Large', nonServi: true })
    expect(modeleDeclencheur('inconnu', CATALOGUE)).toEqual({ label: 'inconnu', nonServi: true })
    expect(modeleDeclencheur('mistral-large', [])).toEqual({ label: 'mistral-large', nonServi: false })
  })

  it('le fuseau courant est toujours proposé, une seule fois', () => {
    expect(fuseauxProposes('Mars/Olympus')[0]).toBe('Mars/Olympus')
    expect(fuseauxProposes('Europe/Paris').filter((z) => z === 'Europe/Paris')).toHaveLength(1)
  })
})
