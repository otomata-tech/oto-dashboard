// Filtres de colonne du datastore : dérivation du type depuis les valeurs, ops par
// type, et assemblage en ColumnFilter[] (les ops « vide/rempli » sans valeur, les
// autres vidées si la saisie est blanche). Logique pure, filtrage réel server-side.
import { describe, expect, it } from 'vitest'
import {
  columnFilterKind, OPS_BY_KIND, opLabel, defaultOp, opNeedsValue, buildFilters,
  filterChipLabel, filtersToParam, filtersFromParam, isMetaDateField, metaFieldLabel,
} from './datastoreFilters'

describe('columnFilterKind', () => {
  it('detects number from the first non-empty value', () => {
    expect(columnFilterKind([{ n: '' }, { n: 42 }], 'n')).toBe('number')
  })

  it('detects date from an ISO-ish value', () => {
    expect(columnFilterKind([{ d: '2026-06-22 09:07' }], 'd')).toBe('date')
  })

  it('falls back to text for plain strings', () => {
    expect(columnFilterKind([{ s: 'hello' }], 's')).toBe('text')
  })

  it('returns text when every row is empty for the field', () => {
    expect(columnFilterKind([{ x: '' }, { x: null }], 'x')).toBe('text')
  })

  it('trusts the declared schema type over the values on the page', () => {
    // Colonne vide sur la page courante : sans le type déclaré elle retombait en
    // `text` et perdait ses ops d'ordre (≥ / ≤) alors que le schéma la dit chiffrée.
    expect(columnFilterKind([{ n: null }], 'n', 'number')).toBe('number')
    expect(columnFilterKind([], 'd', 'datetime')).toBe('date')
    expect(columnFilterKind([], 'e', 'enum')).toBe('text')
    // Type inconnu / composite → on retombe sur la détection par la valeur.
    expect(columnFilterKind([{ j: 12 }], 'j', 'json')).toBe('number')
  })

  it('detects bool from a boolean value', () => {
    expect(columnFilterKind([{ b: false }], 'b')).toBe('bool')
  })
})

describe('dates système (colonnes méta)', () => {
  it('types them without looking at the values', () => {
    // Page vide (ou filtrée à zéro) : c'est justement là qu'on veut saisir un
    // filtre de date — le deviner des valeurs rendrait `text`.
    expect(columnFilterKind([], '_updated_at')).toBe('timestamp')
    expect(columnFilterKind([{ _created_at: null }], '_created_at')).toBe('timestamp')
  })

  it('only matches the exact meta names', () => {
    expect(isMetaDateField('_updated_at')).toBe(true)
    expect(isMetaDateField('updated_at')).toBe(false)   // champ user homonyme
  })

  it('offers no empty/not_empty op (the column is NOT NULL, backend refuses)', () => {
    expect(OPS_BY_KIND.timestamp).not.toContain('empty')
    expect(OPS_BY_KIND.timestamp).not.toContain('not_empty')
  })

  it('speaks of dates, not of orders', () => {
    expect(opLabel('gte', 'timestamp')).toBe('à partir du')
    expect(opLabel('lte', 'timestamp')).toBe("jusqu'au")
  })

  it('names the column in a chip like the header does', () => {
    expect(metaFieldLabel('_updated_at')).toBe('modifié le')
    expect(filterChipLabel({ field: '_updated_at', op: 'gte', value: '2026-08-01' }, 'timestamp'))
      .toBe('modifié le à partir du 2026-08-01')
  })
})

describe('op helpers', () => {
  it('defaultOp is the first op of the kind', () => {
    expect(defaultOp('text')).toBe(OPS_BY_KIND.text[0])
    expect(defaultOp('number')).toBe('eq')
  })

  it('opNeedsValue is false only for empty/not_empty', () => {
    expect(opNeedsValue('empty')).toBe(false)
    expect(opNeedsValue('not_empty')).toBe(false)
    expect(opNeedsValue('contains')).toBe(true)
  })

  it('opLabel contextualizes date ops', () => {
    expect(opLabel('gte', 'date')).toBe('à partir du')
    expect(opLabel('gte', 'number')).toBe('≥')
  })
})

describe('buildFilters', () => {
  it('keeps valued filters, trims whitespace, drops blank ones', () => {
    expect(buildFilters({
      name: { op: 'contains', value: '  acme ' },
      note: { op: 'contains', value: '   ' },
    })).toEqual([{ field: 'name', op: 'contains', value: 'acme' }])
  })

  it('keeps empty/not_empty ops with no value', () => {
    expect(buildFilters({ email: { op: 'not_empty', value: '' } }))
      .toEqual([{ field: 'email', op: 'not_empty', value: '' }])
  })

  it('produces an empty list for an empty state', () => {
    expect(buildFilters({})).toEqual([])
  })
})

describe('filterChipLabel', () => {
  it('renders field, op label and value', () => {
    expect(filterChipLabel({ field: 'name', op: 'contains', value: 'acme' }, 'text'))
      .toBe('name contient acme')
  })

  it('omits the value for empty/not_empty', () => {
    expect(filterChipLabel({ field: 'email', op: 'not_empty', value: '' }, 'text'))
      .toBe('email rempli')
  })

  it('humanizes booleans', () => {
    expect(filterChipLabel({ field: 'done', op: 'eq', value: 'true' }, 'bool'))
      .toBe('done est vrai')
  })
})

describe('filters ↔ URL param', () => {
  it('round-trips a filter list', () => {
    const filters = [
      { field: 'name', op: 'contains' as const, value: 'acme' },
      { field: 'email', op: 'not_empty' as const, value: '' },
      { field: 'score', op: 'gte' as const, value: '10' },
    ]
    expect(filtersFromParam(filtersToParam(filters))).toEqual(filters)
  })

  it('serializes an empty list to an empty string', () => {
    expect(filtersToParam([])).toBe('')
    expect(filtersFromParam('')).toEqual([])
    expect(filtersFromParam(null)).toEqual([])
  })

  it('ignores malformed input instead of crashing (URL = saisie utilisateur)', () => {
    expect(filtersFromParam('not json')).toEqual([])
    expect(filtersFromParam('{"a":1}')).toEqual([])
    expect(filtersFromParam('[["f","bogus_op","x"]]')).toEqual([])
    expect(filtersFromParam('[[42,"eq","x"]]')).toEqual([])
  })

  it('drops valued ops whose value is blank, keeps valid triples', () => {
    expect(filtersFromParam('[["f","eq",""],["g","eq","ok"]]'))
      .toEqual([{ field: 'g', op: 'eq', value: 'ok' }])
  })
})
