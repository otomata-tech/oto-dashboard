import { describe, it, expect } from 'vitest'
import type { DatastoreRow } from '@/types/api'
import { bailLigne } from './bailDeLigne'

function row(over: Partial<DatastoreRow> = {}): DatastoreRow {
  return { _id: 'r1', ...over }
}

const T = (s: string) => Date.parse(s)

describe('le bail d’une ligne', () => {
  it('relie la ligne au run qui la tient — ce que le bail ne disait pas', () => {
    const b = bailLigne(row({
      _claimed_by: 'sub-worker', _claimed_until: '2026-09-01 12:00:00',
      _claimed_run: 'run_42',
    }), T('2026-09-01T11:00:00Z'))
    expect(b.etat).toBe('actif')
    expect(b.porteur).toBe('run')
    expect(b.run).toBe('run_42')
  })

  // ⚠️ Trois états, pas deux. `null` ne veut pas dire « on ne sait pas » : il veut
  // dire que le bail a été pris SANS run — une personne sur la file du dashboard,
  // ou un agent sans `_run_id`. C'est un fait connu, et l'écran doit le nommer.
  it('distingue « bail pris sans run » d’une ligne sans bail du tout', () => {
    const sansRun = bailLigne(row({ _claimed_by: 'sub-humain', _claimed_run: null }), Date.now())
    expect(sansRun.etat).toBe('actif')
    expect(sansRun.porteur).toBe('sans-run')
    expect(sansRun.run).toBeNull()

    const libre = bailLigne(row(), Date.now())
    expect(libre.etat).toBe('libre')
    expect(libre.porteur).toBe('hors-bail')
  })

  // Le serveur n'efface pas `claimed_run` à la libération (oto-backend #664) : la
  // colonne peut rester garnie sur une ligne LIBRE. La rattacher à son ancien run
  // ferait pointer vers un travail qui ne la tient plus.
  it('ne rattache pas une ligne libérée au run qui la tenait avant', () => {
    const b = bailLigne(row({ _claimed_run: 'run_ancien' }), Date.now())
    expect(b.etat).toBe('libre')
    expect(b.porteur).toBe('hors-bail')
    expect(b.run).toBeNull()
  })

  it('voit expiré un bail dépassé — le prochain claim recyclera la ligne', () => {
    const b = bailLigne(row({
      _claimed_by: 'sub-worker', _claimed_until: '2026-09-01 10:00:00',
    }), T('2026-09-01T10:30:00Z'))
    expect(b.etat).toBe('expire')
  })

  // ⚠️ Le piège vécu : « 2026-09-01 12:00:00 » sans fuseau, lu comme heure LOCALE,
  // décale de deux heures l'été — un bail qui court passerait pour expiré.
  it('lit la fin de bail en UTC, pas en heure locale', () => {
    const b = bailLigne(row({
      _claimed_by: 'sub-worker', _claimed_until: '2026-09-01 12:00:00',
    }), T('2026-09-01T11:30:00Z'))
    expect(b.fin).toBe(T('2026-09-01T12:00:00Z'))
    expect(b.etat).toBe('actif')
  })
})
