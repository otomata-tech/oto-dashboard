// Chemin de retour dans le graphe de cycle de vie : c'est ce calcul qui décide si
// l'UI peut proposer « annuler » après une transition. Fixture = le lifecycle réel
// de mucho-leads (celui de l'incident : un clic « → ecarte » sans retour direct).
import { describe, expect, it } from 'vitest'
import { transitionPath } from './datastoreLifecycle'

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
