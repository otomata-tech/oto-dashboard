// Formulaire typé du drawer (schéma v2) — helpers PURS : ordre/descriptors des
// champs, coercion draft ⇄ payload par type déclaré, nettoyage des composites.
import { describe, expect, it } from 'vitest'
import type { DatastoreField, DatastoreSchema } from '@/types/api'
import {
  compositeDraft, formFields, isEmptyPayloadValue, isSubRecordList,
  payloadValue, pruneComposite,
} from './datastoreForm'

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
  it('composite : prune les champs vides et les items vides', () => {
    expect(payloadValue(desc('contacts'), [{ nom: 'Jean', email: '' }, {}]))
      .toEqual([{ nom: 'Jean' }])
  })
})

describe('composites', () => {
  const contacts = schema.fields!.find((f) => f.key === 'contacts')!
  const idcc = schema.fields!.find((f) => f.key === 'idcc')!
  it('isSubRecordList distingue list de sous-records vs list scalaire', () => {
    expect(isSubRecordList(contacts)).toBe(true)
    expect(isSubRecordList(idcc)).toBe(false)
  })
  it('compositeDraft normalise (null → vide, scalaire isolé → [x])', () => {
    expect(compositeDraft(contacts, null)).toEqual([])
    expect(compositeDraft(idcc, 'a')).toEqual(['a'])
    expect(compositeDraft({ key: 'o', type: 'object', fields: [] } as DatastoreField, null)).toEqual({})
  })
  it('pruneComposite objet : champs vides retirés', () => {
    expect(pruneComposite({ key: 'o', type: 'object', fields: [] } as DatastoreField,
      { a: 'x', b: '', c: null })).toEqual({ a: 'x' })
  })
})

describe('isEmptyPayloadValue', () => {
  it('vide = "" / null / [] / {}', () => {
    expect(isEmptyPayloadValue('')).toBe(true)
    expect(isEmptyPayloadValue(null)).toBe(true)
    expect(isEmptyPayloadValue([])).toBe(true)
    expect(isEmptyPayloadValue({})).toBe(true)
    expect(isEmptyPayloadValue(0)).toBe(false)
    expect(isEmptyPayloadValue(false)).toBe(false)
    expect(isEmptyPayloadValue([{}])).toBe(false)
  })
})
