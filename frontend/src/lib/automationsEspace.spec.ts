// L'espace Automatisations (oto#214) : ce qu'une adresse désigne et ce que l'URL porte. Les
// montages des pages vivent dans `views/console/automations/espace*.spec.ts` ; ici, les
// règles pures qu'ils supposent.
import { describe, expect, it } from 'vitest'
import {
  affichesDeQuery, detailEspace, filDAriane, filtreCampagnes, filtresExecutions, garderCampagne,
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

  it('la navigation surligne la rubrique d’une page de détail', () => {
    expect(rubriqueDe('accueil')).toBeNull()
    expect(rubriqueDe('campagne')).toBe('campagnes')
    expect(rubriqueDe('reglages')).toBe('programmations')
    expect(rubriqueDe('execution')).toBe('executions')
  })

  it('le fil mène à chaque page parente, jamais à la page courante', () => {
    expect(filDAriane('accueil', null).map((m) => m.to)).toEqual([null])
    expect(filDAriane('campagnes', null).map((m) => m.to)).toEqual(['/automations', null])
    expect(filDAriane('campagne', '7').map((m) => m.to)).toEqual(['/automations', '/automations/campaigns', null])
    const reglages = filDAriane('reglages', '3')
    expect(reglages.map((m) => m.to)).toEqual(['/automations', '/automations/schedules', '/automations/schedules/3', null])
    expect(reglages[2]!.params).toEqual({ id: '3' })
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

  it('le filtre des campagnes, sur la liste COMPLÈTE', () => {
    expect(filtreCampagnes({ status: 'live' })).toEqual({ valeur: 'live', ignores: [] })
    expect(filtreCampagnes({ status: 'running' })).toEqual({ valeur: null, ignores: ['status=running'] })
    const vivantes = ['armed', 'running', 'stopping', 'stopped', 'draft'].filter((s) => garderCampagne({ status: s }, 'live'))
    expect(vivantes).toEqual(['armed', 'running', 'stopping'])
    expect(garderCampagne({ status: 'stopped' }, 'stopped')).toBe(true)
    expect(garderCampagne({ status: 'draft' }, null)).toBe(true)
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
