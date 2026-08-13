// La cascade `display` → `role`, et surtout son ORDRE : c'est lui qui décide
// qu'un schéma neuf soit titré correctement, et lui qu'on ne peut pas vérifier
// à l'œil sur un écran (les deux clés coexistent aujourd'hui sur les 57 schémas
// convertis, donc les deux ordres donnent le même résultat sur l'existant).
import { describe, expect, it } from 'vitest'
import { champTitre, cleTitre } from './datastoreTitle'
import type { DatastoreField } from '../types/api'

const f = (o: Partial<DatastoreField>): DatastoreField => ({ key: 'x', ...o }) as DatastoreField

describe('quel champ nomme une ligne', () => {
  it('lit `display: "title"` — la convention du serveur', () => {
    expect(cleTitre([f({ key: 'siren' }), f({ key: 'nom', display: 'title' })])).toBe('nom')
  })

  it('retombe sur `role: "title"` pour les schémas anciens', () => {
    // La conversion a été faite en ADDITIF : tant qu'un schéma servi porte
    // encore `role` seul, le retirer ferait perdre son titre à une ligne — une
    // table qui s'affiche par des identifiants, sans une erreur.
    expect(cleTitre([f({ key: 'nom', role: 'title' })])).toBe('nom')
  })

  it('⚠️ `display` PRIME sur `role`, même porté par un autre champ', () => {
    // L'ordre inverse gagnerait un `role` résiduel contre la déclaration
    // courante — et ne se verrait pas sur les schémas convertis, qui portent
    // les deux clés sur le MÊME champ.
    const champs = [f({ key: 'ancien', role: 'title' }), f({ key: 'neuf', display: 'title' })]
    expect(cleTitre(champs)).toBe('neuf')
  })

  it('les deux clés sur le même champ ne le comptent qu\'une fois', () => {
    // Le cas des 57 schémas convertis : additif, donc `display` ET `role`.
    expect(cleTitre([f({ key: 'nom', display: 'title', role: 'title' })])).toBe('nom')
  })

  it('aucun titre déclaré ⇒ null, jamais un champ au hasard', () => {
    // Le repli sur `_id` appartient à l'appelant : titrer une ligne avec la
    // première colonne venue serait une devinette, et elle changerait au
    // premier champ ajouté au schéma.
    expect(champTitre([f({ key: 'siren' }), f({ key: 'ville' })])).toBeNull()
    expect(cleTitre([])).toBeNull()
  })

  it('un schéma absent ne lève pas', () => {
    expect(cleTitre(null)).toBeNull()
    expect(cleTitre(undefined)).toBeNull()
  })
})
