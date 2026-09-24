// Export du journal des accès (oto#269) : l'export parcourt toutes les pages sur la fenêtre
// que la première a gelée, et dit s'il est complet — une pièce qui ne le vérifie pas
// n'atteste de rien.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getOrgAuditLogExport: vi.fn() }))
vi.mock('@/api/console', () => api)

import { auditCsv, auditFileName, collectAuditLog, dayBound } from './auditExport'

const ligne = (id: number) => ({ id, created_at: '2026-09-24 10:00:00', sub: 'u', email: 'a@b.fr', tool: 'fr_get', ok: true })
const page = (ids: number[], extra: Record<string, unknown>) =>
  ({ org_id: 2, since: null, until: null, until_effectif: '2026-09-24T12:00:00', total: 3, count: ids.length, calls: ids.map(ligne), ...extra })

describe('collectAuditLog', () => {
  beforeEach(() => { api.getOrgAuditLogExport.mockReset() })

  it('suit le curseur SEUL après la première page, et se dit complet', async () => {
    api.getOrgAuditLogExport
      .mockResolvedValueOnce(page([1, 2], { truncated: true, next_cursor: 'c1' }))
      .mockResolvedValueOnce(page([3], { truncated: false, next_cursor: null }))
    const vus: number[] = []
    const c = await collectAuditLog(2, { since: '2026-09-01T00:00:00.000Z' }, (got) => vus.push(got))
    expect(api.getOrgAuditLogExport.mock.calls[0]).toEqual([2, { since: '2026-09-01T00:00:00.000Z' }])
    // La fenêtre voyage dans le curseur : la repasser serait refusé (`window_with_cursor`).
    expect(api.getOrgAuditLogExport.mock.calls[1]).toEqual([2, { cursor: 'c1' }])
    expect(c.calls.map((x) => x.id)).toEqual([1, 2, 3])
    expect(c.complete).toBe(true)
    expect(vus).toEqual([2, 3])
  })

  it('moins de lignes reçues que le total annoncé : incomplet, jamais maquillé', async () => {
    api.getOrgAuditLogExport.mockResolvedValueOnce(page([1, 2], { truncated: false, next_cursor: null }))
    const c = await collectAuditLog(2, {})
    expect(c.complete).toBe(false)
  })
})

describe('mise en forme', () => {
  it('une date du champ devient un instant de début ou de fin de journée ; vide = pas de borne', () => {
    expect(dayBound('', 'start')).toBeUndefined()
    const debut = new Date(dayBound('2026-09-01', 'start')!)
    const fin = new Date(dayBound('2026-09-01', 'end')!)
    expect(fin.getTime() - debut.getTime()).toBe(24 * 3600 * 1000 - 1)
  })

  it('le CSV a ses colonnes, le nom de fichier dit la fenêtre', () => {
    const csv = auditCsv([ligne(1)] as never)
    expect(csv.split('\r\n')[0]).toBe('created_at,email,sub,tool,namespace,ok,error,duration_ms,client_name,client_version,token_kind')
    expect(auditFileName(2, { calls: [], total: 0, since: null, untilEffectif: '2026-09-24T12:00:00', complete: true }, 'csv'))
      .toBe('journal-acces-org2-debut-au-2026-09-24.csv')
  })
})
