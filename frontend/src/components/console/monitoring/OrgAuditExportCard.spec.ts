// Le parcours d'export du journal des accès d'une org (otomata-tech/oto#269).
//
// Ce que le typecheck ne voit pas, et que ces tests tiennent :
//   1. le droit : le geste n'existe que pour qui le serveur sert la lecture
//      (`ORG_ADMIN_OF` → `isOrgAdmin`), jamais pour un simple membre ;
//   2. l'appel : la période part en ISO sur la route servie, le fichier est la réponse
//      servie (complétude comprise), et la suite part avec le SEUL curseur ;
//   3. le refus : la phrase du serveur s'affiche telle quelle ; un curseur refusé
//      propose de repartir du début.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import type { AuditExport } from '@/types/api'

const api = vi.hoisted(() => ({
  getOrgAuditLogExport: vi.fn(),
  getOrg: vi.fn(),
  getOrgAdoption: vi.fn(), getOrgMonitoringSummary: vi.fn(), getOrgMonitoringConnectors: vi.fn(),
  getOrgMonitoringCalls: vi.fn(), getOrgMonitoringCall: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const saveBlob = vi.hoisted(() => vi.fn())
vi.mock('@/lib/download', () => ({ saveBlob }))
const me = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me, reload: vi.fn() }),
}))
// L'onglet « journal » ouvert d'emblée, comme par un lien `?tab=journal`.
vi.mock('@/composables/useDeepLink', () => ({
  useDeepLink: (key: string) => ({ read: () => (key === 'tab' ? 'journal' : null), set: vi.fn() }),
}))

import { ApiError } from '@/api'
import OrgAuditExportCard from './OrgAuditExportCard.vue'
import { i18n } from '@/lib/i18n'

const LIGNE = {
  id: 7, created_at: '2026-09-20 10:00:00', sub: 'u-1', email: 'alice@acme.test',
  tool: 'fr_get', ok: true, error: null, duration_ms: 120, namespace: 'fr',
  client_name: 'claude-code', client_version: '2.1.0', token_kind: 'delegation',
}

function page(over: Partial<AuditExport> = {}): AuditExport {
  return {
    org_id: 42, since: null, until: null, until_effectif: '2026-09-24 12:00:00',
    total: 1, count: 1, truncated: false, next_cursor: null, calls: [LIGNE], ...over,
  }
}

async function settle() {
  for (let i = 0; i < 8; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 8; i++) await nextTick()
}

async function monter(comp: object, props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  i18n.global.locale.value = 'fr'
  const app = createApp(h(comp, props)).use(i18n)
  app.mount(host)
  await settle()
  return { host, done: () => { app.unmount(); host.remove() } }
}

const bouton = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label))

async function cliquer(host: HTMLElement, label: string) {
  const b = bouton(host, label)
  expect(b, `bouton « ${label} »`).toBeTruthy()
  b!.click()
  await settle()
}

async function saisir(host: HTMLElement, index: number, valeur: string) {
  const input = host.querySelectorAll('input[type="date"]')[index] as HTMLInputElement
  input.value = valeur
  input.dispatchEvent(new Event('input'))
  await settle()
}

async function contenuTelecharge(n = 0): Promise<unknown> {
  const blob = saveBlob.mock.calls[n]![1] as Blob
  return JSON.parse(await blob.text())
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getOrgAuditLogExport.mockResolvedValue(page())
  api.getOrg.mockResolvedValue({ org: { id: 42, name: 'ACME', my_role: null }, members: [] })
  api.getOrgAdoption.mockResolvedValue({ members: [], truncated: false })
  api.getOrgMonitoringSummary.mockResolvedValue(null)
  api.getOrgMonitoringConnectors.mockResolvedValue(null)
  api.getOrgMonitoringCalls.mockResolvedValue({ calls: [] })
})

describe('export du journal des accès — le droit', () => {
  it('un membre sans droit ne voit pas le geste, et rien ne part', async () => {
    me.value = { sub: 'u-2', role: 'member', org_role: 'member', active_org: 42 }
    const View = (await import('@/views/console/OrgMonitoringView.vue')).default
    const v = await monter(View)
    expect(bouton(v.host, 'Exporter')).toBeUndefined()
    expect(api.getOrgAuditLogExport).not.toHaveBeenCalled()
    v.done()
  })

  it.each([
    ['org_admin', { sub: 'u-1', role: 'member', org_role: 'org_admin', active_org: 42 }],
    // En consultation : c'est une LECTURE (GET), le serveur la sert — le geste reste.
    ['super_admin en consultation', { sub: 'u-9', role: 'super_admin', org_role: null, active_org: 42, active_org_readonly: true }],
  ])('%s voit le geste dans l’onglet journal de la supervision d’org', async (_, porteur) => {
    me.value = porteur
    const View = (await import('@/views/console/OrgMonitoringView.vue')).default
    const v = await monter(View)
    expect(bouton(v.host, 'Exporter (JSON)')).toBeTruthy()
    v.done()
  })
})

describe('export du journal des accès — l’appel et la pièce', () => {
  it('part avec la période en ISO, télécharge la réponse servie et dit sa complétude', async () => {
    const v = await monter(OrgAuditExportCard, { orgId: 42 })
    await saisir(v.host, 0, '2026-09-01')
    await saisir(v.host, 1, '2026-09-30')
    await cliquer(v.host, 'Exporter (JSON)')

    expect(api.getOrgAuditLogExport).toHaveBeenCalledTimes(1)
    const [org, params] = api.getOrgAuditLogExport.mock.calls[0]!
    expect(org).toBe(42)
    expect(params.since).toBe(new Date('2026-09-01T00:00:00').toISOString())
    expect(params.until).toBe(new Date('2026-09-30T23:59:59.999').toISOString())
    expect(params.cursor).toBeUndefined()

    expect(saveBlob).toHaveBeenCalledTimes(1)
    expect(saveBlob.mock.calls[0]![0]).toBe('journal-acces-org-42-20260924120000-p1.json')
    // La pièce est la réponse servie : complétude, fenêtre et émetteur déclaré compris.
    expect(await contenuTelecharge()).toEqual(page())

    const txt = v.host.textContent ?? ''
    expect(txt).toContain('complet')
    expect(txt).toMatch(/1\s*ligne\(s\) téléchargée\(s\) sur\s*1/)
    expect(txt).toContain('fenêtre appliquée')
    expect(txt).toContain('claude-code 2.1.0 · jeton delegation (1)')
    expect(bouton(v.host, 'Télécharger la suite')).toBeUndefined()
    v.done()
  })

  it('tronqué : dit ce qui reste, et la suite part avec le SEUL curseur', async () => {
    api.getOrgAuditLogExport
      .mockResolvedValueOnce(page({ total: 2, truncated: true, next_cursor: 'CUR1' }))
      .mockResolvedValueOnce(page({ total: 2, truncated: true, next_cursor: null,
        calls: [{ ...LIGNE, id: 6, client_name: null, client_version: null, token_kind: null }] }))
    const v = await monter(OrgAuditExportCard, { orgId: 42 })
    await saisir(v.host, 0, '2026-09-01')
    await cliquer(v.host, 'Exporter (JSON)')

    let txt = v.host.textContent ?? ''
    expect(txt).toContain('tronqué')
    expect(txt).toContain('il reste 1 ligne(s)')

    await cliquer(v.host, 'Télécharger la suite')
    expect(api.getOrgAuditLogExport.mock.calls[1]).toEqual([42, { cursor: 'CUR1' }])
    expect(saveBlob.mock.calls[1]![0]).toBe('journal-acces-org-42-20260924120000-p2.json')
    txt = v.host.textContent ?? ''
    expect(txt).toContain('complet')
    expect(txt).toMatch(/2\s*ligne\(s\) téléchargée\(s\) sur\s*2/)
    expect(txt).toContain('non déclaré (1)')
    v.done()
  })
})

describe('export du journal des accès — le refus', () => {
  it('affiche la phrase du serveur, et ne télécharge rien', async () => {
    api.getOrgAuditLogExport.mockRejectedValue(
      new ApiError(403, 'org_admin_required', 'Réservé à un admin de l’org #42.'))
    const v = await monter(OrgAuditExportCard, { orgId: 42 })
    await cliquer(v.host, 'Exporter (JSON)')
    expect(v.host.textContent).toContain('Export impossible : Réservé à un admin de l’org #42.')
    expect(saveBlob).not.toHaveBeenCalled()
    v.done()
  })

  it('un curseur refusé propose de repartir du début, sans curseur', async () => {
    api.getOrgAuditLogExport
      .mockResolvedValueOnce(page({ total: 2, truncated: true, next_cursor: 'ABIME' }))
      .mockRejectedValueOnce(new ApiError(400, 'invalid_cursor', '`cursor` illisible — reprends l’export sans `cursor`.'))
      .mockResolvedValueOnce(page())
    const v = await monter(OrgAuditExportCard, { orgId: 42 })
    await cliquer(v.host, 'Exporter (JSON)')
    await cliquer(v.host, 'Télécharger la suite')
    expect(v.host.textContent).toContain('`cursor` illisible')
    await cliquer(v.host, 'Recommencer depuis le début')
    expect(api.getOrgAuditLogExport.mock.calls[2]![1]).not.toHaveProperty('cursor')
    expect(v.host.textContent).toContain('complet')
    v.done()
  })
})
