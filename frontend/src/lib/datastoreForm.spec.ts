// Formulaire typé du drawer (schéma v2) — helpers PURS : ordre/descriptors des
// champs, coercion saisie → payload d'un scalaire par type déclaré. Le brouillon d'une
// ligne et ce qu'il écrit (plus aucun élagage, oto#213) : `rowDraft.spec.ts`.
import { describe, expect, it } from 'vitest'
import type { DatastoreSchema } from '@/types/api'
import { formFields, isSubRecordList, payloadValue } from './datastoreForm'

const schema: DatastoreSchema = {
  key: 'siren',
  strict: true,
  fields: [
    { key: 'nom', role: 'title', type: 'text', required: true },
    { key: 'bp', type: 'number', label: 'BP/an' },
    { key: 'actif', type: 'bool' },
    { key: 'contacts', type: 'list', of: { fields: [{ key: 'nom', type: 'text', required: true }, { key: 'email', type: 'text' }] } },
    { key: 'idcc', type: 'list', of: { type: 'text' } },
    { key: 'notes', role: 'note', type: 'text', required_when: { statut: 'qualified' } },
  ],
}

describe('formFields', () => {
  it('déclarés d’abord (ordre du schéma), puis champs de row non déclarés', () => {
    const out = formFields(schema, { _id: 'r1', extra_col: 'x', nom: 'ACME' }, ['legacy'], [])
    expect(out.map((d) => d.key)).toEqual(['nom', 'bp', 'actif', 'contacts', 'idcc', 'notes', 'extra_col', 'legacy'])
    expect(out[0]).toMatchObject({ declared: true, required: true, label: 'nom' })
    expect(out.find((d) => d.key === 'bp')?.label).toBe('BP/an')
    expect(out.find((d) => d.key === 'extra_col')?.declared).toBe(false)
  })
  it('les métas _… sont exclues, required_when est porté', () => {
    const out = formFields(schema, { _id: 'r1', _claimed_by: 'w' }, [], [])
    expect(out.some((d) => d.key.startsWith('_'))).toBe(false)
    expect(out.find((d) => d.key === 'notes')?.requiredWhen).toEqual({ statut: 'qualified' })
  })
  it('sansCouches : une couche servie à plat n’est pas offerte comme un champ', () => {
    const ligne = { _id: 'r1', adresse: 'x', 'adresse.comment': 'c', 'adresse.origine': 'o' }
    const cles = (sans: boolean) => formFields(null, ligne, ['ville.link'], [], sans).map((d) => d.key)
    expect(cles(true)).toEqual(['adresse'])
    // la lecture seule garde l'affichage historique
    expect(cles(false)).toEqual(['adresse', 'adresse.comment', 'adresse.origine', 'ville.link'])
  })
})

describe('payloadValue', () => {
  const desc = (key: string) => formFields(schema, null, [], []).find((d) => d.key === key)!
  it('number déclaré : string numérique → number, non numérique laissé (backend tranche)', () => {
    expect(payloadValue(desc('bp'), '42.5')).toBe(42.5)
    expect(payloadValue(desc('bp'), 'n/a')).toBe('n/a')
    expect(payloadValue(desc('bp'), '')).toBe('')
  })
  it('bool déclaré : "true"/"false" → booléen', () => {
    expect(payloadValue(desc('actif'), 'true')).toBe(true)
    expect(payloadValue(desc('actif'), 'false')).toBe(false)
  })
  it('text déclaré : JAMAIS re-parsé en JSON (un "12" reste string)', () => {
    expect(payloadValue(desc('nom'), '12')).toBe('12')
  })
  it('non déclaré : comportement historique (JSON si parsable)', () => {
    const d = { key: 'x', label: 'x', type: null, required: false, declared: false }
    expect(payloadValue(d, '12')).toBe(12)
    expect(payloadValue(d, 'abc')).toBe('abc')
  })
})

describe('composites', () => {
  const contacts = schema.fields!.find((f) => f.key === 'contacts')!
  const idcc = schema.fields!.find((f) => f.key === 'idcc')!
  it('isSubRecordList distingue list de sous-records vs list scalaire', () => {
    expect(isSubRecordList(contacts)).toBe(true)
    expect(isSubRecordList(idcc)).toBe(false)
  })
})
