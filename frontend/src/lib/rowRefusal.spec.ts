// Le refus du schéma rattaché au CHAMP fautif (oto#219), lu dans la charge à renvoyer que
// le serveur sert (oto#135) — jamais dans la phrase.
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api'
import { fautesDe, refusDeLigne } from './rowRefusal'

describe('fautesDe — la charge à renvoyer, champ par champ', () => {
  it('un élément de liste désigné par son RANG : colonne, rang, sous-champ, gabarit', () => {
    const f = fautesDe({
      a_renvoyer: { contacts: [{ email: '<email>', age: '<nombre>' }] },
      a_renvoyer_elements: ['contacts[2]'],
    })
    expect(f).toEqual([
      { colonne: 'contacts', element: 2, identite: null, champ: 'email', attendu: '<email>' },
      { colonne: 'contacts', element: 2, identite: null, champ: 'age', attendu: '<nombre>' },
    ])
  })

  it('un élément désigné par son IDENTITÉ : la clé d’identité désigne, elle n’est pas fautive', () => {
    const f = fautesDe({
      a_renvoyer: { contacts: [{ email: 'a@b.fr', age: '<nombre>' }] },
      a_renvoyer_elements: ['contacts[email=a@b.fr]'],
    })
    expect(f).toEqual([{ colonne: 'contacts', element: null, identite: ['email', 'a@b.fr'], champ: 'age', attendu: '<nombre>' }])
  })

  it('une colonne simple et un objet', () => {
    expect(fautesDe({ a_renvoyer: { nom: '<texte>', adresse: { ville: '<texte>' } } })).toEqual([
      { colonne: 'nom', element: null, identite: null, champ: null, attendu: '<texte>' },
      { colonne: 'adresse', element: null, identite: null, champ: 'ville', attendu: '<texte>' },
    ])
  })

  it('pas de charge : aucune faute, le repli en tête de fiche reste', () => {
    expect(fautesDe(undefined)).toEqual([])
    expect(fautesDe({ expected_column: 'nom' })).toEqual([])
  })
})

describe('refusDeLigne — la colonne vient de expected_column, sinon de la charge', () => {
  it('sans expected_column, la première colonne fautive porte le refus', () => {
    const r = refusDeLigne(new ApiError(400, 'row_invalid', 'contacts[0].email : requis', {
      a_renvoyer: { contacts: [{ email: '<email>' }] }, a_renvoyer_elements: ['contacts[0]'],
    }))
    expect(r).toMatchObject({ sorte: 'invalide', colonne: 'contacts', chemin: null })
    expect(r?.sorte === 'invalide' && r.fautes).toHaveLength(1)
  })
})
