// Quelles colonnes d'un tableau sont à l'utilisateur, et lesquelles sont visibles
// — la règle que l'export CSV et DataTable.vue partagent (oto-dashboard#137).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { userFields, defaultColumns, visibleColumns } from './datastoreColumns'

describe('userFields', () => {
  it('exclut toute clé préfixée `_`, connue ou pas', () => {
    const rows = [
      { _id: '1', _created_at: 't', _updated_at: 't', _claimed_by: 'w', _claimed_until: 't', nom: 'a' },
    ]
    expect(userFields(rows)).toEqual(['nom'])
  })

  it("n'a besoin d'aucune liste énumérée — une colonne interne inconnue est couverte", () => {
    // La ligne de #137 : `_claimed_by`/`_claimed_until` sont nées APRÈS l'exclusion
    // énumérée et l'ont traversée. La règle par préfixe n'a rien à énumérer.
    expect(userFields([{ _brand_new_internal_field: 1, x: 1 }])).toEqual(['x'])
  })

  it('conserve l\'ordre de première apparition, union sur toutes les lignes', () => {
    expect(userFields([{ b: 1 }, { a: 1, b: 2 }, { c: 1 }])).toEqual(['b', 'a', 'c'])
  })

  it('rend [] sur un jeu vide', () => {
    expect(userFields([])).toEqual([])
  })
})

describe('defaultColumns', () => {
  it('sans schéma, rend tous les champs tels quels', () => {
    expect(defaultColumns(['a', 'b'], null)).toEqual(['a', 'b'])
    expect(defaultColumns(['a', 'b'], { fields: [] })).toEqual(['a', 'b'])
  })

  it('retire les champs déclarés `hidden: true` au schéma', () => {
    const schema = { fields: [{ key: 'a' }, { key: 'b', hidden: true }, { key: 'c', hidden: false }] }
    expect(defaultColumns(['a', 'b', 'c'], schema)).toEqual(['a', 'c'])
  })

  it('un champ user hors schéma reste visible par défaut (le schéma ne le connaît pas)', () => {
    const schema = { fields: [{ key: 'a', hidden: true }] }
    expect(defaultColumns(['a', 'residuel'], schema)).toEqual(['residuel'])
  })
})

describe('visibleColumns', () => {
  const schema = { fields: [{ key: 'a' }, { key: 'b', hidden: true }, { key: 'c' }] }

  it('sans choix ponctuel, applique le `hidden` du schéma', () => {
    expect(visibleColumns(['a', 'b', 'c'], schema, null)).toEqual(['a', 'c'])
  })

  it('le choix ponctuel (`?cols=`) prime sur le schéma, y compris pour ré-afficher une colonne masquée', () => {
    expect(visibleColumns(['a', 'b', 'c'], schema, ['b'])).toEqual(['b'])
  })

  it('un `?cols=` qui pointe une colonne disparue depuis ne la ressuscite pas', () => {
    expect(visibleColumns(['a', 'c'], schema, ['a', 'b', 'c'])).toEqual(['a', 'c'])
  })

  it('un choix ponctuel vide (tout décoché) est respecté — aucune colonne', () => {
    expect(visibleColumns(['a', 'b', 'c'], schema, [])).toEqual([])
  })
})
// ── la couche API ne repose jamais le schéma entier ─────────────────────────
// « Enregistrer comme vue par défaut » a quitté le dashboard (oto#192, 12/09/2026). Ce témoin
// reste parce qu'il ne dépendait pas du bouton : un `PUT` vers `…/schema`, reconstruit depuis
// les seuls champs que le front connaît, efface pour tout le monde ce qu'il ne connaît pas
// (défaut fermé le 08/09/2026). Il vise le GESTE, quel que soit le nom de la fonction.
describe('la couche API ne repose jamais le schéma entier', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
  const compact = (s: string) => s.replace(/\s+/g, ' ')

  it('la couche API ne porte AUCUN PUT qui repose le schéma entier', () => {
    expect(compact(readFileSync(join(SRC, 'api/console.ts'), 'utf8'))).not.toMatch(/\/schema`,\s*\{\s*method: 'PUT'/)
  })
})
