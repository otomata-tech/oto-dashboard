import { describe, it, expect, beforeEach } from 'vitest'
import type { RunnerJob } from '@/api/console'
import { i18n } from '@/lib/i18n'
import {
  autresResultat, bail, bailExpire, coutTravail, ecart, estConclu, instant, libelleTravail,
  modeleTravail, outilsResultat, postesResultat, renvoiMuet, renvois, sejourMs,
} from './runnerJobs'

function job(over: Partial<RunnerJob> = {}): RunnerJob {
  return {
    id: 1, kind: 'start', run_id: null, payload: null, status: 'done',
    attempts: 1, max_attempts: 3, claimed_by: null, last_error: null,
    result: null, due_at: null, created_at: null, finished_at: null,
    ...over,
  }
}

beforeEach(() => { i18n.global.locale.value = 'fr' })

describe('horodatages du runner', () => {
  it('lit un horodatage sans fuseau comme de l’UTC, pas comme de l’heure locale', () => {
    // Le backend sert « 2026-08-28 13:53:53 » : `Date.parse` le lirait en heure
    // LOCALE, et un travail de l'instant s'afficherait « il y a 2 h » l'été.
    expect(instant('2026-08-28 13:53:53')).toBe(Date.parse('2026-08-28T13:53:53Z'))
  })

  it('mesure un travail non conclu jusqu’à maintenant — c’est ce qui montre un agent bloqué', () => {
    const maintenant = Date.parse('2026-08-28T14:00:00Z')
    const enCours = job({ status: 'claimed', created_at: '2026-08-28 13:30:00' })
    expect(sejourMs(enCours, maintenant)).toBe(30 * 60_000)
  })

  it('arrête le compteur d’un travail conclu à sa conclusion', () => {
    const maintenant = Date.parse('2026-08-28T20:00:00Z')
    const fini = job({ created_at: '2026-08-28 13:30:00', finished_at: '2026-08-28 13:32:00' })
    expect(sejourMs(fini, maintenant)).toBe(2 * 60_000)
  })

  it('dit un écart passé en minutes, heures, jours — et un instant futur « à l’instant »', () => {
    expect(ecart(20_000)).toEqual({ cle: 'now', n: 0 })
    expect(ecart(5 * 60_000)).toEqual({ cle: 'minutes', n: 5 })
    expect(ecart(3 * 3_600_000)).toEqual({ cle: 'hours', n: 3 })
    expect(ecart(50 * 3_600_000)).toEqual({ cle: 'days', n: 2 })
    expect(ecart(-60_000)).toEqual({ cle: 'now', n: 0 })
  })
})

describe('statut d’un travail → libellé', () => {
  it.each([
    ['pending', 'en file'], ['claimed', 'en vol'], ['done', 'terminée'], ['failed', 'en échec'],
    ['abandoned', 'abandonnée'],
    // ⚠️ `expired` a son libellé : personne n'est venu le prendre, ce n'est pas un échec.
    ['expired', 'expirée'],
  ])('%s → %s', (status, attendu) => {
    const l = libelleTravail(status)
    expect(i18n.global.t(l.cle, l.params)).toBe(attendu)
    expect(i18n.global.te(l.cle, 'en')).toBe(true)
  })

  it('`expired` ne prend pas le ton d’un échec', () => {
    expect(libelleTravail('expired').ton).not.toBe(libelleTravail('failed').ton)
  })

  it('un statut inconnu se montre tel quel, jamais rangé sous un voisin', () => {
    const l = libelleTravail('requeued')
    expect(i18n.global.t(l.cle, l.params)).toBe('statut inconnu : requeued')
  })
})

describe('le coût d’un travail', () => {
  it('⚠️ un travail sans résultat a un coût INCONNU, jamais 0', () => {
    expect(coutTravail(job({ result: null }))).toEqual({ etat: 'inconnu' })
  })

  it('un résultat qui ne déclare pas de jetons laisse le coût inconnu', () => {
    expect(coutTravail(job({ result: { stopped: 'end_turn' } }))).toEqual({ etat: 'inconnu' })
  })

  it('un zéro DÉCLARÉ est un vrai zéro', () => {
    expect(coutTravail(job({ result: { usage_tokens: 0 } }))).toEqual({ etat: 'connu', jetons: 0 })
  })

  it('rend les jetons déclarés', () => {
    expect(coutTravail(job({ result: { usage_tokens: 1500 } }))).toEqual({ etat: 'connu', jetons: 1500 })
  })

  it('un travail conclu est celui dont un coût absent se dit « inconnu » dans une liste', () => {
    expect(['done', 'failed', 'expired', 'abandoned'].every((s) => estConclu(job({ status: s })))).toBe(true)
    expect(['pending', 'claimed'].some((s) => estConclu(job({ status: s })))).toBe(false)
  })
})

describe('le modèle d’un travail', () => {
  it('rend le modèle déclaré, et `null` quand il manque — l’écran dit « non déclaré »', () => {
    expect(modeleTravail(job({ result: { model: 'mistral-large-2512' } }))).toBe('mistral-large-2512')
    expect(modeleTravail(job({ result: { model: null } }))).toBeNull()
    expect(modeleTravail(job({ result: null }))).toBeNull()
  })
})

describe('renvois du harnais', () => {
  it('ne compte aucun renvoi sur une première prise, et les prises au-delà', () => {
    expect(renvois(job({ attempts: 1 }))).toBe(0)
    expect(renvois(job({ attempts: 3 }))).toBe(2)
  })

  it('distingue le renvoi SANS motif — un worker mort en cours de bail', () => {
    expect(renvoiMuet(job({ attempts: 2, last_error: null }))).toBe(true)
    expect(renvoiMuet(job({ attempts: 2, last_error: 'amont en vrac' }))).toBe(false)
    expect(renvoiMuet(job({ attempts: 1 }))).toBe(false)
  })
})

describe('le bail du travail', () => {
  const t = (s: string) => Date.parse(s)

  it('dit EXPIRÉ sur une prise en cours dont la date est passée — le worker est parti', () => {
    const j = job({ status: 'claimed', lease_until: '2026-09-01 10:00:00' })
    const b = bail(j, t('2026-09-01T10:05:00Z'))
    expect(b.etat).toBe('expire')
    expect(b.resteMs).toBe(-5 * 60_000)
    expect(bailExpire(j, t('2026-09-01T10:05:00Z'))).toBe(true)
  })

  it('ne dit JAMAIS « expiré » sur un travail conclu, même avec une date passée', () => {
    const fini = job({ status: 'done', lease_until: '2026-09-01 10:00:00' })
    const b = bail(fini, t('2026-09-01T18:00:00Z'))
    expect(b.etat).toBe('tenu')
    expect(bailExpire(fini, t('2026-09-01T18:00:00Z'))).toBe(false)
    expect(b.resteMs).toBeNull()
  })

  it('n’invente pas de bail là où le travail n’a jamais été pris', () => {
    expect(bail(job({ status: 'pending' }), Date.now()).etat).toBe('aucun')
  })
})

describe('lecture du résultat', () => {
  it('nomme les postes connus et traduit un motif d’arrêt connu', () => {
    const postes = postesResultat(job({
      result: { steps: 12, stopped: 'max_steps', usage_input: 10_000, usage_cache_read: 9_000 },
    }))
    const stop = postes.find((p) => p.cle === 'stopped')!
    expect(i18n.global.t(stop.valeurCle!)).toBe('plafond d\'étapes atteint')
    expect(stop.ton).toBe('attention')
    expect(postes.find((p) => p.cle === 'usage_cache_read')?.valeur).toBe('9 k')
    for (const p of postes) expect(i18n.global.te(p.label, 'en'), p.label).toBe(true)
  })

  it('rend un motif d’arrêt inconnu tel quel plutôt que de l’inventer', () => {
    const stop = postesResultat(job({ result: { stopped: 'quelque_chose_de_neuf' } }))[0]!
    expect(stop.valeur).toBe('quelque_chose_de_neuf')
    expect(stop.valeurCle).toBeUndefined()
  })

  it('trie le relevé d’outils du plus appelé au moins', () => {
    const outils = outilsResultat(job({
      result: { tool_counts: { data_write: 2, fr_search: 9, oto_doc: 0 } },
    }))
    expect(outils.map((o) => o.outil)).toEqual(['fr_search', 'data_write'])
  })

  // LE test qui protège le contrat ouvert : un champ que le worker déclare et que
  // l'écran ne connaît pas se montre sous sa clé brute.
  it('rend sous sa clé brute un champ que le worker déclare et qu’on ne sait pas nommer', () => {
    const cles = autresResultat(job({ result: { usage_tokens: 10, poste_inedit: 7 } })).map((a) => a.cle)
    expect(cles).toContain('poste_inedit')
    expect(cles).not.toContain('usage_tokens')
  })

  it('les champs que le runner n’écrit plus ne sont plus nommés : sur un travail ancien, ils restent lisibles sous leur clé', () => {
    const ancien = job({ result: { claims: 1, writes: 0, faux_depart: true, valeurs_cliente_reparees: ['ville'] } })
    const postes = postesResultat(ancien).map((p) => p.cle)
    expect(postes).toEqual([])
    const autres = autresResultat(ancien).map((a) => a.cle)
    expect(autres).toEqual(['claims', 'writes', 'faux_depart', 'valeurs_cliente_reparees'])
  })

  it('ne déverse pas dans « autres » ce qui est rendu ailleurs (coût, modèle, arrêt, outils)', () => {
    const autres = autresResultat(job({ result: {
      usage_tokens: 12345, usage_input: 10000, usage_output: 2345, usage_cache_read: 9000,
      usage_cache_write: 0, stopped: 'end_turn', steps: 7, model: 'mistral-large-2512',
      tool_counts: { data_write: 1 },
    } }))
    expect(autres).toEqual([])
  })
})
