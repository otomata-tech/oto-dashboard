// Le mot d'un compte vient du registre ; son GENRE, non. Ce fichier tient les accords
// que l'écran écrit autour de ce mot — « Ajouter un société » est le bouton que l'admin
// d'un groupe PayFit aurait lu sans eux.
import { describe, expect, it } from 'vitest'
import { accountWords } from './accountNoun'

describe('accountWords — les accords du mot du registre', () => {
  it('un mot masculin : le cas de tous les connecteurs avant PayFit', () => {
    const w = accountWords('workspace')
    expect([w.un, w.le, w.ce, w.aucun, w.second, w.lun, w.pronom, w.lequel, w.e, w.plural]).toEqual([
      'un workspace', 'le workspace', 'ce workspace', 'aucun workspace', 'un second workspace',
      "l'un", 'le', 'lequel', '', 'workspaces',
    ])
  })

  it('un mot féminin : « société »', () => {
    const w = accountWords('société')
    expect([w.un, w.le, w.ce, w.aucun, w.second, w.lun, w.pronom, w.lequel, w.e, w.plural]).toEqual([
      'une société', 'la société', 'cette société', 'aucune société', 'une seconde société',
      "l'une", 'la', 'laquelle', 'e', 'sociétés',
    ])
  })

  it('une voyelle élide l’article, au féminin comme au masculin', () => {
    expect(accountWords('organisation').le).toBe("l'organisation")
    expect(accountWords('organisation').ce).toBe('cette organisation')
    expect(accountWords('espace').le).toBe("l'espace")
    expect(accountWords('espace').ce).toBe('cet espace')
  })

  it('rien de servi : « compte », le mot par défaut du registre', () => {
    expect(accountWords(undefined).un).toBe('un compte')
    expect(accountWords('  ').noun).toBe('compte')
  })

  it('un mot inconnu s’accorde au masculin — faute visible, jamais un geste faux', () => {
    expect(accountWords('succursale').un).toBe('un succursale')
  })
})
