// Export du journal des accès d'une org (oto#269) : une PIÈCE DE CONFORMITÉ, que l'admin
// produit devant un auditeur ou un délégué à la protection des données. Ce qui compte n'est
// pas le fichier, c'est qu'il puisse dire s'il est complet.
//
// Le serveur sert des pages sur une fenêtre FERMÉE : `total` compte la
// fenêtre, `next_cursor` porte la suite ET la fenêtre, `until_effectif` dit la borne haute
// réellement appliquée. On parcourt toutes les pages, puis on vérifie que la somme des lignes
// reçues vaut `total` — une pièce qui ne le vérifie pas n'atteste de rien.
import { getOrgAuditLogExport } from '@/api/console'
import { rowsToCsv } from '@/lib/csv'
import type { AuditCall } from '@/types/api'

export interface AuditWindow { since?: string; until?: string }

export interface AuditCollected {
  calls: AuditCall[]
  total: number
  since: string | null
  untilEffectif: string
  complete: boolean
}

// Garde : une boucle de curseurs ne doit jamais tourner sans fin sur une réponse anormale.
const MAX_PAGES = 1000

export async function collectAuditLog(
  orgId: number, win: AuditWindow, onProgress?: (got: number, total: number) => void,
): Promise<AuditCollected> {
  let page = await getOrgAuditLogExport(orgId, win)
  const total = page.total
  const calls: AuditCall[] = [...page.calls]
  onProgress?.(calls.length, total)
  let n = 1
  while (page.truncated && page.next_cursor && n < MAX_PAGES) {
    page = await getOrgAuditLogExport(orgId, { cursor: page.next_cursor })
    calls.push(...page.calls)
    onProgress?.(calls.length, total)
    n++
  }
  return {
    calls, total,
    since: page.since ?? win.since ?? null,
    untilEffectif: page.until_effectif,
    complete: calls.length === total && !page.truncated,
  }
}

/** Une date du champ (AAAA-MM-JJ, heure locale) → l'instant ISO de début ou de fin de journée. */
export function dayBound(day: string, edge: 'start' | 'end'): string | undefined {
  if (!day) return undefined
  const d = new Date(`${day}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}`)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export const AUDIT_COLUMNS = [
  'created_at', 'email', 'sub', 'tool', 'namespace', 'ok', 'error', 'duration_ms',
  'client_name', 'client_version', 'token_kind',
]

export const auditCsv = (calls: AuditCall[]) =>
  rowsToCsv(calls as unknown as Array<Record<string, unknown>>, AUDIT_COLUMNS)

/** La version JSON porte la pièce ENTIÈRE : la fenêtre appliquée, le total, et la preuve
 * de complétude, à côté des lignes. */
export function auditJson(orgId: number, c: AuditCollected): string {
  return JSON.stringify({
    org_id: orgId, exported_at: new Date().toISOString(),
    since: c.since, until_effectif: c.untilEffectif,
    total: c.total, count: c.calls.length, complete: c.complete, calls: c.calls,
  }, null, 2)
}

/** Nom de fichier qui dit la fenêtre : la pièce se range et se relit sans l'ouvrir. */
export function auditFileName(orgId: number, c: AuditCollected, ext: 'csv' | 'json'): string {
  const d = (iso: string | null) => (iso ? iso.slice(0, 10) : 'debut')
  return `journal-acces-org${orgId}-${d(c.since)}-au-${d(c.untilEffectif)}.${ext}`
}
