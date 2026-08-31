import { describe, it, expect } from 'vitest'
import type { RunnerJob } from '@/api/console'
import {
  autresResultat, compteGarde, instant, outilsResultat, postesResultat,
  renvoiMuet, renvois, sejourMs, totalGardes,
} from './runnerJobs'

function job(over: Partial<RunnerJob> = {}): RunnerJob {
  return {
    id: 1, kind: 'start', run_id: null, payload: null, status: 'done',
    attempts: 1, max_attempts: 3, claimed_by: null, last_error: null,
    result: null, due_at: null, created_at: null, finished_at: null,
    ...over,
  }
}

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
})

describe('renvois du harnais', () => {
  // `claim_next_job` fait `attempts = attempts + 1` à CHAQUE prise, reprise d'un
  // bail mort comprise : la première prise est normale, les suivantes sont des
  // renvois. Ce test tient ce décalage — le lire à l'envers ferait signaler un
  // renvoi sur tous les travaux de la file.
  it('ne compte aucun renvoi sur une première prise', () => {
    expect(renvois(job({ attempts: 1 }))).toBe(0)
  })

  it('compte les prises au-delà de la première', () => {
    expect(renvois(job({ attempts: 3 }))).toBe(2)
  })

  it('distingue le renvoi SANS motif — un worker mort en cours de bail', () => {
    expect(renvoiMuet(job({ attempts: 2, last_error: null }))).toBe(true)
    // Avec un motif déclaré, c'est un échec de l'agent : il ne se soigne pas pareil.
    expect(renvoiMuet(job({ attempts: 2, last_error: 'amont en vrac' }))).toBe(false)
    expect(renvoiMuet(job({ attempts: 1 }))).toBe(false)
  })
})

describe('postes de garde', () => {
  it('additionne les trois postes d’un travail pourtant conclu sans erreur', () => {
    // Le cas qui justifie la carte : statut « terminé », aucune erreur, et
    // pourtant la garde a dû intervenir.
    const j = job({
      status: 'done',
      result: { valeurs_cliente_reparees: 2, valeurs_cliente_detruites: 1 },
    })
    expect(totalGardes(j)).toBe(3)
    expect(compteGarde(j, 'contacts_fabriques_retires')).toBe(0)
  })

  it('ne voit aucune garde là où le worker n’en déclare pas', () => {
    expect(totalGardes(job({ result: { usage_tokens: 400 } }))).toBe(0)
    expect(totalGardes(job({ result: null }))).toBe(0)
  })
})

describe('lecture du résultat', () => {
  it('nomme les postes connus et traduit le motif d’arrêt', () => {
    const postes = postesResultat(job({
      result: { claims: 1, writes: 3, steps: 12, stopped: 'end_turn', usage_tokens: 1500 },
    }))
    const par = Object.fromEntries(postes.map((p) => [p.cle, p.valeur]))
    expect(par.writes).toBe('3')
    expect(par.stopped).toBe('fin de tour')
    expect(par.usage_tokens).toBe('2k')
  })

  it('rend un motif d’arrêt inconnu tel quel plutôt que de l’inventer', () => {
    const postes = postesResultat(job({ result: { stopped: 'quelque_chose_de_neuf' } }))
    expect(postes.find((p) => p.cle === 'stopped')?.valeur).toBe('quelque_chose_de_neuf')
  })

  it('signale la réservation sans écriture, qui ne lève aucune erreur', () => {
    const postes = postesResultat(job({ result: { claims: 1, faux_depart: true } }))
    const issue = postes.find((p) => p.cle === 'faux_depart')
    expect(issue?.valeur).toBe('réservé, rien écrit')
    expect(issue?.ton).toBe('attention')
  })

  it('trie le relevé d’outils du plus appelé au moins', () => {
    const outils = outilsResultat(job({
      result: { tool_counts: { data_write: 2, fr_search: 9, oto_kb: 0 } },
    }))
    expect(outils.map((o) => o.outil)).toEqual(['fr_search', 'data_write'])
  })

  // LE test qui protège le contrat ouvert. `JobResult` est `extra=allow` côté
  // backend : le worker peut déclarer un champ que cet écran ne connaît pas. S'il
  // était filtré, « l'écran ne le montre pas » se lirait « le worker ne le produit
  // pas » — le pire des deux malentendus.
  it('rend sous sa clé brute un champ que le worker déclare et qu’on ne sait pas nommer', () => {
    const autres = autresResultat(job({
      result: { usage_tokens: 10, estampille: true, poste_inedit: 7 },
    }))
    const cles = autres.map((a) => a.cle)
    expect(cles).toContain('estampille')
    expect(cles).toContain('poste_inedit')
    // Ce qui est déjà rendu ailleurs ne se répète pas dans « autres ».
    expect(cles).not.toContain('usage_tokens')
  })

  it('ne range pas les postes de garde dans « autres » — ils ont leur bandeau', () => {
    const autres = autresResultat(job({ result: { valeurs_cliente_reparees: 2 } }))
    expect(autres.map((a) => a.cle)).not.toContain('valeurs_cliente_reparees')
  })
})
