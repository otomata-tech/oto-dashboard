// L'instant d'une entrée de journal : le backend émet une heure NUE (fuseau retiré,
// pas converti), et `Date.parse` d'une telle chaîne la lit en heure LOCALE. D'où le
// geste qu'on vient de poser affiché « 2 h » à Paris, et une date absolue au milieu
// d'une colonne de durées à l'ouest de Greenwich. `whenOf` rétablit l'offset.
import { describe, expect, it } from 'vitest'
import { whenOf } from './rowActivity'
import { relDate } from './cellRender'
import type { RowActivityEntry } from '@/types/api'

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
