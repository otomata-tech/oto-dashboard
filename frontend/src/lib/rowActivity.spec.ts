// L'instant d'une entrée de journal : le backend émet une heure NUE (fuseau retiré,
// pas converti), et `Date.parse` d'une telle chaîne la lit en heure LOCALE. D'où le
// geste qu'on vient de poser affiché « 2 h » à Paris, et une date absolue au milieu
// d'une colonne de durées à l'ouest de Greenwich. `whenOf` rétablit l'offset.
import { describe, expect, it } from 'vitest'
import { type ColumnChange, actorOf, changeOf, isKnownOrigin, originLabel, originOf, originTone, valueChangesOf, whenOf } from './rowActivity'
import { relDate } from './cellRender'
import type { RowActivityEntry, RowRevision, RowWriteSource } from '@/types/api'

const entry = (created_at: string): RowActivityEntry => ({
  created_at, kind: 'rest', tool: 'data_write', ok: true, error: null,
  sub: null, email: null, run_id: null, run_label: null, doctrine: null, outcome: null,
  row_id: null, row_title: null, fields: [], from_status: null, to_status: null,
})

describe('whenOf', () => {
  it('rend lisible comme UTC une heure nue (le format du wire)', () => {
    expect(whenOf(entry('2026-07-28 16:05:09'))).toBe('2026-07-28T16:05:09Z')
    expect(Date.parse(whenOf(entry('2026-07-28 16:05:09')))).toBe(
      Date.UTC(2026, 6, 28, 16, 5, 9))
  })

  it('laisse intacte une valeur qui porte déjà son fuseau', () => {
    expect(whenOf(entry('2026-07-28T16:05:09Z'))).toBe('2026-07-28T16:05:09Z')
    expect(whenOf(entry('2026-07-28T16:05:09+00:00'))).toBe('2026-07-28T16:05:09+00:00')
    expect(whenOf(entry('2026-07-28T18:05:09+0200'))).toBe('2026-07-28T18:05:09+0200')
  })

  it('le geste qu\'on vient de poser se lit « à l\'instant », quel que soit le fuseau', () => {
    const now = Date.UTC(2026, 6, 28, 16, 5, 30)
    expect(relDate(whenOf(entry('2026-07-28 16:05:09')), now)).toBe("à l'instant")
  })
})

// ── M3 (oto#273) : le parcours lit le journal des révisions ────────────────────────
// Une entrée servie par un backend ANTÉRIEUR n'a aucun des quatre champs : elle doit se
// lire exactement comme avant. Une entrée qui porte `source` est nommée par elle, pas
// par `kind`. Une entrée qui porte `revisions` montre les valeurs, colonne par colonne.

const t = (k: string) => `«${k}»`
const ancienne = (over: Partial<RowActivityEntry> = {}): RowActivityEntry => ({
  ...entry('2026-09-20 10:00:00'), kind: 'mcp', tool: 'data_write', fields: ['nom', 'ville'], ...over,
})
const revision = (over: Partial<RowRevision>): RowRevision => ({
  rev: 1, at: '2026-09-24 10:00:00', acteur: 'usr_a', source: 'console', geste_id: 'g1', diff: {}, ...over,
})

describe('origine d\'une entrée', () => {
  it('backend ancien (aucun des nouveaux champs) : rest = console, mcp = agent, comme avant', () => {
    expect(originOf(ancienne({ kind: 'rest' }))).toBe('console')
    expect(originTone(ancienne({ kind: 'rest' }))).toBe('cobalt')
    expect(originOf(ancienne())).toBe('agent')
    expect(originTone(ancienne())).toBe('olive')
    expect(originLabel(ancienne(), t)).toBe('«rowActivity.origin.agent»')
  })

  it.each<[RowWriteSource, string]>([
    ['console', 'cobalt'], ['agent', 'olive'], ['import', 'saffron'],
    ['upload', 'saffron'], ['api', 'ink'], ['system', 'ink'],
  ])('`source: %s` fait foi, quel que soit `kind`', (source, tone) => {
    // un appel MCP dont l'écriture est journalisée `console` n'est pas « agent »
    const e = ancienne({ kind: 'mcp', source })
    expect(originOf(e)).toBe(source)
    expect(originTone(e)).toBe(tone)
    expect(originLabel(e, t)).toBe(`«rowActivity.origin.${source}»`)
  })

  it('`kind: revision` sans source n\'est pas « agent » : origine inconnue', () => {
    const e = ancienne({ kind: 'revision', tool: null })
    expect(originOf(e)).toBe('unknown')
    expect(originTone(e)).toBe('ink')
  })

  it('`kind: revision` avec source : la source', () => {
    expect(originOf(ancienne({ kind: 'revision', tool: null, source: 'upload' }))).toBe('upload')
  })

  it('une source que ce front ne connaît pas est rendue telle quelle, en ink', () => {
    const e = ancienne({ source: 'formule' as RowWriteSource })
    expect(isKnownOrigin(originOf(e))).toBe(false)
    expect(originLabel(e, t)).toBe('formule')
    expect(originTone(e)).toBe('ink')
  })

  it('l\'acteur du journal nomme une écriture sans sub ni email (`service:<nom>`)', () => {
    expect(actorOf(ancienne({ acteur: 'service:formules' }))).toBe('service:formules')
  })
})

describe('valueChangesOf', () => {
  it('backend ancien : null, et `changeOf` garde les noms de colonnes', () => {
    expect(valueChangesOf(ancienne())).toBeNull()
    expect(changeOf(ancienne())).toBe('nom, ville')
  })

  it('avant → après par colonne, valeurs lisibles', () => {
    const e = ancienne({
      kind: 'rest', source: 'console', geste_id: 'g1', acteur: 'usr_a',
      revisions: [revision({ diff: {
        n: { avant: 1, apres: 2 },
        nom: { apres: 'A' },                                    // ajout
        vieux: { avant: 'x' },                                  // retrait
        efface: { avant: 'y', apres: null },
        ville: { avant: { valeur: 'Paris', comment: 'site' }, apres: { valeur: 'Lyon', link: 'https://ex.fr' } },
        cherche: { avant: '', apres: { valeur: '@empty' } },
        tags: { avant: ['a'], apres: ['a', { valeur: 'b' }, 'c', 'd', 'e'] },
        long: { apres: 'x'.repeat(100) },
      } })],
    })
    const changes = valueChangesOf(e)!
    const col = (f: string): ColumnChange => {
      const c = changes.find((x) => x.field === f)
      if (!c) throw new Error(`colonne ${f} absente`)
      return c
    }
    expect(changes.map((c) => c.field)).toEqual(['cherche', 'efface', 'long', 'n', 'nom', 'tags', 'vieux', 'ville'])
    expect(col('n')).toEqual({ field: 'n', avant: { text: '1' }, apres: { text: '2' } })
    expect(col('nom').avant).toEqual({ marker: 'absent' })
    expect(col('vieux').apres).toEqual({ marker: 'absent' })
    expect(col('efface').apres).toEqual({ marker: 'null' })
    expect(col('ville').avant).toEqual({ text: 'Paris', comment: 'site' })
    expect(col('ville').apres).toEqual({ text: 'Lyon', link: 'https://ex.fr' })
    expect(col('cherche')).toMatchObject({ avant: { text: '""' }, apres: { marker: 'empty' } })
    expect(col('tags').avant.text).toBe('a')
    expect(col('tags').apres.text).toBe('a, b, c +2')
    expect(col('long').apres.text).toHaveLength(60)
    expect(col('long').apres.text!.endsWith('…')).toBe(true)
    expect(col('long').apres.full).toBe('x'.repeat(100))
  })

  it('un geste de plusieurs révisions : l\'avant de la plus ancienne, l\'après de la plus récente', () => {
    const e = ancienne({ revisions: [
      revision({ rev: 3, diff: { n: { avant: 2, apres: 3 } } }),
      revision({ rev: 2, diff: { n: { avant: 1, apres: 2 }, m: { apres: 'z' } } }),
    ] })
    expect(valueChangesOf(e)).toEqual([
      { field: 'm', avant: { marker: 'absent' }, apres: { text: 'z' } },
      { field: 'n', avant: { text: '1' }, apres: { text: '3' } },
    ])
  })
})
