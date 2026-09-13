// Le brouillon d'une ligne et ce qu'il ÉCRIT (oto#213) — fonctions pures, sur une ligne
// relue en forme réinscriptible (`empties=sentinel`, `layers=nested`) : couches, vides
// assumés au premier niveau et dans un élément de liste, origine.
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { DatastoreSchema } from '@/types/api'
import { formFields } from './datastoreForm'
import { avecCouches, caseIntacte } from './rowCells'
import {
  accepteVideColonne, accepteVideSousChamp, brouillonDeLigne, correctif, elementSaisi,
  type Brouillon, type CompositeSaisi, type ElementSaisi,
} from './rowDraft'

const SCHEMA: DatastoreSchema = {
  fields: [
    { key: 'nom', type: 'text', required: true },
    { key: 'ville', type: 'text' },
    { key: 'adresse', type: 'text' },
    { key: 'effectif', type: 'number' },
    { key: 'meta', type: 'json' },
    {
      key: 'contacts', type: 'list',
      of: { key: 'email', fields: [{ key: 'email' }, { key: 'nom', required: true }, { key: 'fonction' }] },
    },
    { key: 'idcc', type: 'list', of: { type: 'text' } },
    { key: 'siege', type: 'object', fields: [{ key: 'rue' }] },
  ],
}
const CHAMP = (cle: string) => SCHEMA.fields!.find((f) => f.key === cle)!

type Ligne = Record<string, unknown>
const LUE = (): Ligne => ({
  _id: 'r1', _revision: '7',
  nom: { valeur: 'ACME', origine: 'sirene' },
  ville: { valeur: '@empty' },
  adresse: { valeur: '1 rue X', comment: 'registre', link: 'https://registre', origine: 'sirene' },
  effectif: 12,
  meta: { a: 1 },
  contacts: [
    { email: 'a@x.fr', nom: 'Alice', fonction: { valeur: 'DG', comment: 'intérim' } },
    { email: 'b@x.fr', nom: 'Bob', fonction: { valeur: '@empty' } },
    { email: { valeur: 'c@x.fr', origine: 'apollo', comment: 'vu' }, nom: 'Chloé', fonction: '' },
  ],
  idcc: ['1486'],
  siege: { rue: '1 rue X' },
  note: 'libre',
})

const champs = (ligne: Ligne | null) => formFields(SCHEMA, ligne, [], [], true)
/** Ouvre la ligne, applique un geste au brouillon, rend le corps de l'écriture. */
function ecrire(ligne: Ligne, geste: (b: Brouillon) => void) {
  const b = brouillonDeLigne(champs(ligne), ligne)
  geste(b)
  return correctif(champs(ligne), ligne, b)
}
const elements = (b: Brouillon, cle: string): ElementSaisi[] =>
  (b.composites[cle] as Extract<CompositeSaisi, { sorte: 'elements' }>).elements
const saisir = (e: ElementSaisi, cle: string, texte: string) => {
  e.textes[cle] = texte
  if (texte.trim()) e.vides[cle] = false
}

describe('la différence, et rien d’autre', () => {
  it('aller-retour sans modification : corps VIDE (donc aucun PATCH)', () => {
    expect(ecrire(LUE(), () => {})).toEqual({})
  })

  it('une modification : UNE colonne, coercée par son type', () => {
    expect(ecrire(LUE(), (b) => { b.scalaires.effectif = '13' })).toEqual({ effectif: 13 })
  })

  it('une colonne liste part ENTIÈRE, les éléments non touchés tels que relus, moins origine', () => {
    const corps = ecrire(LUE(), (b) => saisir(elements(b, 'contacts')[0]!, 'nom', 'Alicia'))
    expect(Object.keys(corps)).toEqual(['contacts'])
    expect(corps.contacts).toEqual([
      { email: 'a@x.fr', nom: 'Alicia', fonction: { valeur: 'DG', comment: 'intérim' } },
      { email: 'b@x.fr', nom: 'Bob', fonction: { valeur: '@empty' } },
      { email: { valeur: 'c@x.fr', comment: 'vu' }, nom: 'Chloé', fonction: '' },
    ])
  })

  it('contacts[1].fonction = @empty survit à l’édition de contacts[0] ET au retrait de contacts[2]', () => {
    const corps = ecrire(LUE(), (b) => {
      const liste = elements(b, 'contacts')
      saisir(liste[0]!, 'fonction', 'PDG')
      liste.splice(2, 1)
    })
    expect(corps).toEqual({
      contacts: [
        { email: 'a@x.fr', nom: 'Alice', fonction: { valeur: 'PDG', comment: 'intérim' } },
        { email: 'b@x.fr', nom: 'Bob', fonction: { valeur: '@empty' } },
      ],
    })
  })

  it('un élément relu qui n’est pas un sous-record reste tel quel : rien ne quitte la liste sans geste', () => {
    const ligne = { _id: 'r2', contacts: [null, { email: 'a@x.fr', nom: 'A' }] }
    const corps = ecrire(ligne, (b) => saisir(elements(b, 'contacts')[1]!, 'nom', 'B'))
    expect(corps).toEqual({ contacts: [null, { email: 'a@x.fr', nom: 'B' }] })
  })

  it('un ajout est la différence avec une ligne vide : les vides ne partent pas, un vide assumé si', () => {
    const b = brouillonDeLigne(champs(null), null)
    b.scalaires.nom = 'Nouvelle'
    b.vides.ville = true
    expect(correctif(champs(null), {}, b)).toEqual({ nom: 'Nouvelle', ville: '@empty' })
  })
})

describe('une case modifiée garde ses couches', () => {
  it('modifier la valeur renvoie comment et link tels que lus, valeur seule changée, jamais origine', () => {
    expect(ecrire(LUE(), (b) => { b.scalaires.adresse = '2 rue Y' })).toEqual({
      adresse: { valeur: '2 rue Y', comment: 'registre', link: 'https://registre' },
    })
  })

  it('effacer renvoie les couches à côté de @clear', () => {
    expect(ecrire(LUE(), (b) => { b.scalaires.adresse = '' })).toEqual({
      adresse: { valeur: '@clear', comment: 'registre', link: 'https://registre' },
    })
  })

  it('dans un élément aussi : la cellule modifiée garde son comment', () => {
    const corps = ecrire(LUE(), (b) => saisir(elements(b, 'contacts')[0]!, 'fonction', ''))
    expect((corps.contacts as Ligne[])[0]!.fonction).toEqual({ valeur: '@clear', comment: 'intérim' })
  })

  it('avecCouches : une case lue nue part nue', () => {
    expect(avecCouches('x', 'y')).toBe('y')
    expect(avecCouches({ valeur: 'x', origine: 'o', link: 'l' }, '@clear')).toEqual({ valeur: '@clear', link: 'l' })
  })
})

describe('vider, et le vide assumé', () => {
  it('vider une valeur en place écrit @clear, pas ""', () => {
    expect(ecrire(LUE(), (b) => { b.scalaires.effectif = '' })).toEqual({ effectif: '@clear' })
  })

  it('activer le vide assumé écrit @empty', () => {
    expect(ecrire(LUE(), (b) => { b.scalaires.effectif = ''; b.vides.effectif = true }))
      .toEqual({ effectif: '@empty' })
  })

  it('désactiver un vide assumé : sans valeur → @clear, avec une valeur → la valeur', () => {
    expect(ecrire(LUE(), (b) => { b.vides.ville = false })).toEqual({ ville: { valeur: '@clear' } })
    expect(ecrire(LUE(), (b) => { b.scalaires.ville = 'Lyon' })).toEqual({ ville: { valeur: 'Lyon' } })
  })

  it('dans un élément : vider une cellule nue → @clear ; basculer → @empty', () => {
    const corps = ecrire(LUE(), (b) => {
      const liste = elements(b, 'contacts')
      saisir(liste[0]!, 'nom', '')
      liste[2]!.vides.nom = true
      liste[2]!.textes.nom = ''
    })
    const [a, , c] = corps.contacts as Ligne[]
    expect(a!.nom).toBe('@clear')
    expect(c!.nom).toBe('@empty')
  })

  it('aucune sentinelle sur l’identité, dans un objet, ni dans une colonne json : "" part tel quel', () => {
    const corps = ecrire(LUE(), (b) => {
      saisir(elements(b, 'contacts')[0]!, 'email', '')
      const siege = (b.composites.siege as Extract<CompositeSaisi, { sorte: 'objet' }>).element
      saisir(siege, 'rue', '')
      b.scalaires.meta = ''
    })
    expect((corps.contacts as Ligne[])[0]!.email).toBe('')
    expect(corps.siege).toEqual({ rue: '' })
    expect(corps.meta).toBe('')
  })

  it('la bascule n’est offerte que là où le contrat accepte la sentinelle', () => {
    const desc = (cle: string) => champs(LUE()).find((d) => d.key === cle)!
    expect(accepteVideColonne(desc('ville'))).toBe(true)
    expect(accepteVideColonne(desc('note'))).toBe(true)      // non déclarée
    expect(accepteVideColonne(desc('meta'))).toBe(false)     // json
    expect(accepteVideColonne(desc('contacts'))).toBe(false)
    expect(accepteVideSousChamp(CHAMP('contacts'), 'fonction')).toBe(true)
    expect(accepteVideSousChamp(CHAMP('contacts'), 'email')).toBe(false)
    expect(accepteVideSousChamp(CHAMP('idcc'), 'x')).toBe(false)
    expect(accepteVideSousChamp(CHAMP('siege'), 'rue')).toBe(false)
  })
})

describe('les cases renvoyées intactes', () => {
  it('origine n’est jamais renvoyée ; une case réduite à null n’est pas nommée', () => {
    expect(caseIntacte({ valeur: 'x', origine: 'o', link: 'l' })).toEqual({ valeur: 'x', link: 'l' })
    expect(caseIntacte({ valeur: null, comment: 'c', origine: 'o' })).toEqual({ comment: 'c' })
    expect(caseIntacte({ valeur: null, origine: 'o' })).toBeUndefined()
    expect(caseIntacte({ valeur: '@empty', comment: 'c' })).toEqual({ valeur: '@empty', comment: 'c' })
  })

  it('le brouillon est une COPIE d’une ligne réactive (proxy Vue), sans DataCloneError', () => {
    const ligne = reactive(LUE())
    const b = brouillonDeLigne(champs(ligne), ligne)
    elements(b, 'contacts')[0]!.textes.nom = 'muté'
    expect((ligne.contacts as Ligne[])[0]!.nom).toBe('Alice')
    expect(elementSaisi(undefined)).toEqual({ lu: undefined, textes: {}, vides: {} })
  })
})
