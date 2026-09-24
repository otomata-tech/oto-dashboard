// L'espace Automatisations (oto#214) : ce qu'une adresse désigne et ce que l'URL porte. Les
// montages des pages vivent dans `views/console/automations/espace*.spec.ts` ; ici, les
// règles pures qu'ils supposent.
import { describe, expect, it } from 'vitest'
import {
  affichesDeQuery, ANCIENNES_LISTES, detailEspace, filDAriane, filtresExecutions,
  historiqueDe, idDAdresse, META_ESPACE, pageDe, PAGES_ESPACE, programmationDe, queryAvecFiltre,
  rubriqueDe,
} from './automationsEspace'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'

function resoudre(dict: unknown, cle: string): unknown {
  return cle.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict)
}

describe('les pages de l’espace', () => {
  it('chaque page a son titre et son fil, traduits dans les deux langues', () => {
    const absents: string[] = []
    for (const p of PAGES_ESPACE) {
      const meta = META_ESPACE[detailEspace(p.page)]
      if (!meta) { absents.push(`${p.page} : aucun titre`); continue }
      for (const cle of [meta.title, meta.crumb]) {
        for (const [nom, dict] of [['fr', fr], ['en', en]] as const) {
          if (typeof resoudre(dict, cle) !== 'string') absents.push(`${p.page} → ${cle} (${nom})`)
        }
      }
    }
    expect(absents).toEqual([])
  })

  it('une route résout sa page ; toute autre valeur est l’entrée', () => {
    for (const p of PAGES_ESPACE) expect(pageDe(detailEspace(p.page))).toBe(p.page)
    expect(pageDe(undefined)).toBe('accueil')
    expect(pageDe('project')).toBe('accueil')
  })

  it('deux rubriques : les automatisations (l’entrée et les fiches) et les exécutions', () => {
    expect(rubriqueDe('accueil')).toBe('automatisations')
    expect(rubriqueDe('campagne')).toBe('automatisations')
    expect(rubriqueDe('programmation')).toBe('automatisations')
    expect(rubriqueDe('reglages')).toBe('automatisations')
    expect(rubriqueDe('executions')).toBe('executions')
    expect(rubriqueDe('execution')).toBe('executions')
  })

  it('les anciennes listes ne sont plus des pages : leurs adresses sont redirigées', () => {
    for (const path of ANCIENNES_LISTES) expect(PAGES_ESPACE.some((p) => p.path === path)).toBe(false)
  })

  it('le fil mène à chaque page parente, jamais à la page courante, et la racine une fois', () => {
    expect(filDAriane('accueil', null).map((m) => m.to)).toEqual([null])
    expect(filDAriane('campagne', '7').map((m) => m.to)).toEqual(['/automations', null])
    expect(filDAriane('programmation', '3').map((m) => m.to)).toEqual(['/automations', null])
    const reglages = filDAriane('reglages', '3')
    expect(reglages.map((m) => m.to)).toEqual(['/automations', '/automations/schedules/3', null])
    expect(reglages[1]!.params).toEqual({ id: '3' })
    expect(filDAriane('executions', null).map((m) => m.to)).toEqual(['/automations', null])
    expect(filDAriane('execution', '9').map((m) => m.to)).toEqual(['/automations', '/automations/executions', null])
  })
})

describe('ce qu’une adresse porte', () => {
  it('un identifiant est un entier positif, rien d’autre', () => {
    expect(idDAdresse('7')).toBe(7)
    for (const brut of ['0', '-3', '07', '7a', 'abc', '', '1.5', undefined, 7]) expect(idDAdresse(brut)).toBeNull()
  })

  it('les filtres des exécutions : seuls les filtres SERVIS, et un inconnu se dit ignoré', () => {
    expect(filtresExecutions({ source: 'scheduled', status: 'failed', campaign: '7' }))
      .toEqual({ valeur: { source: 'scheduled', status: 'failed', fleet_id: 7 }, ignores: [] })
    // `expired` est un statut SERVI sur une ligne, pas un filtre servi.
    expect(filtresExecutions({ status: 'expired', campaign: 'x' }))
      .toEqual({ valeur: {}, ignores: ['status=expired', 'campaign=x'] })
  })

  it('changer un filtre oublie ce qui avait été déroulé, et garde le reste', () => {
    expect(queryAvecFiltre({ status: 'failed', shown: '50' }, 'source', 'manual'))
      .toEqual({ status: 'failed', source: 'manual' })
    expect(queryAvecFiltre({ status: 'failed', shown: '50' }, 'status', '')).toEqual({})
  })

  it('ce qui a été déroulé', () => {
    expect(affichesDeQuery({ shown: '75' })).toBe(75)
    expect(affichesDeQuery({ shown: 'beaucoup' })).toBeNull()
    expect(affichesDeQuery({})).toBeNull()
  })
})

describe('l’historique d’un objet', () => {
  it('se lit sous le filtre SERVEUR de cet objet', () => {
    expect(historiqueDe('campagne', 7)).toEqual({ fleet_id: 7 })
    expect(historiqueDe('programmation', 3)).toEqual({ trigger_id: 3 })
  })

  it('une exécution nomme sa programmation par le `trigger_id` de sa charge utile', () => {
    expect(programmationDe({ payload: { trigger_id: 3 } })).toBe(3)
    expect(programmationDe({ payload: { trigger_id: '3' } })).toBe(3)
    expect(programmationDe({ payload: { trigger_id: 'x' } })).toBeNull()
    expect(programmationDe({ payload: null })).toBeNull()
  })
})
