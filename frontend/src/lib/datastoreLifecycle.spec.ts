// Chemin de retour dans le graphe de cycle de vie : c'est ce calcul qui décide si
// l'UI peut proposer « annuler » après une transition. Fixture = le lifecycle réel
// de mucho-leads (celui de l'incident : un clic « → ecarte » sans retour direct).
import { describe, expect, it } from 'vitest'
import { estStatutACycle, etatLisible, etatsTerminaux, transitionAnnounce, transitionPath } from './datastoreLifecycle'

const MUCHO: Record<string, string[]> = {
  a_enrichir: ['en_cours', 'enrichi', 'ecarte'],
  en_cours: ['enrichi', 'ecarte', 'a_enrichir'],
  enrichi: ['livre', 'ecarte'],
  ecarte: ['a_enrichir'],
}

describe('transitionPath', () => {
  it('renvoie un chemin vide quand il n\'y a rien à faire', () => {
    expect(transitionPath(MUCHO, 'enrichi', 'enrichi')).toEqual([])
  })

  it('trouve le saut direct quand il est déclaré', () => {
    expect(transitionPath(MUCHO, 'ecarte', 'a_enrichir')).toEqual(['a_enrichir'])
  })

  it('détourne par le graphe quand le retour direct n\'existe pas (cas vécu)', () => {
    // ecarte → enrichi n'est PAS déclaré : le seul retour légal passe par a_enrichir.
    expect(transitionPath(MUCHO, 'ecarte', 'enrichi')).toEqual(['a_enrichir', 'enrichi'])
  })

  it('prend le plus court chemin', () => {
    expect(transitionPath(MUCHO, 'a_enrichir', 'livre')).toEqual(['enrichi', 'livre'])
  })

  it('renvoie null quand la cible est inatteignable', () => {
    // `livre` est terminal : aucune sortie déclarée, donc aucun retour possible.
    expect(transitionPath(MUCHO, 'livre', 'enrichi')).toBeNull()
  })

  it('renvoie null sans graphe de transitions', () => {
    expect(transitionPath(undefined, 'ecarte', 'enrichi')).toBeNull()
    expect(transitionPath(null, 'ecarte', 'enrichi')).toBeNull()
  })

  it('ne boucle pas sur un cycle', () => {
    const cyclic: Record<string, string[]> = { a: ['b'], b: ['a'] }
    expect(transitionPath(cyclic, 'a', 'z')).toBeNull()
  })
})

describe('etatLisible — le libellé d’une étape, par règle générique', () => {
  it('underscores en espaces, première lettre en capitale', () => {
    expect(etatLisible('a_qualifier')).toBe('A qualifier')
    expect(etatLisible('non_interesse')).toBe('Non interesse')
    expect(etatLisible('client')).toBe('Client')
  })
  it('ne devine aucun accent ni aucune traduction', () => {
    expect(etatLisible('contacte')).toBe('Contacte')
  })
  it('laisse intact un libellé déjà lisible, et ne rend jamais une chaîne vide', () => {
    expect(etatLisible('En cours')).toBe('En cours')
    expect(etatLisible('__a__b_')).toBe('A b')
    expect(etatLisible('—')).toBe('—')
    expect(etatLisible('')).toBe('')
  })
})

describe('etatsTerminaux', () => {
  it('prend les étapes finales déclarées', () => {
    expect([...etatsTerminaux({ states: ['a', 'b', 'c'], transitions: { a: ['b'] }, terminal: ['c'] })]).toEqual(['c'])
  })
  it('sinon, les états sans transition sortante', () => {
    expect([...etatsTerminaux({ states: ['a', 'b', 'c'], transitions: { a: ['b'], b: [] } })]).toEqual(['b', 'c'])
  })
  it('aucun cycle de vie : aucune étape finale', () => {
    expect(etatsTerminaux(undefined).size).toBe(0)
  })
})

describe('estStatutACycle', () => {
  it('role status AVEC des états déclarés, rien d’autre', () => {
    expect(estStatutACycle({ key: 's', role: 'status', lifecycle: { states: ['a'] } })).toBe(true)
    expect(estStatutACycle({ key: 's', role: 'status' })).toBe(false)
    expect(estStatutACycle({ key: 's', role: 'badge', lifecycle: { states: ['a'] } })).toBe(false)
    expect(estStatutACycle(null)).toBe(false)
  })
})

describe('transitionAnnounce — la confirmation nomme les étapes en clair', () => {
  it('libellés lisibles dans le message, codes dans le plan de retour', () => {
    const a = transitionAnnounce('ACME', { key: 'statut', from: 'ecarte', to: 'a_enrichir' }, MUCHO)
    expect(a.message).toBe('« ACME » : Ecarte → A enrichir')
    expect(a.undo).toEqual(['ecarte'])
  })
  it('un retour impossible se dit avec les mêmes libellés', () => {
    const a = transitionAnnounce('ACME', { key: 'statut', from: 'enrichi', to: 'livre' }, MUCHO)
    expect(a.message).toBe('« ACME » : Enrichi → Livre — retour impossible : aucun chemin déclaré de « Livre » vers « Enrichi ».')
    expect(a.undo).toBeNull()
  })
})
