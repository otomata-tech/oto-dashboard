// Écrire en tant que (24/09/2026) : le bandeau « voir en tant que » n'offre l'écriture
// qu'au super_admin (figé à l'entrée de la vue, `operator.superAdmin`), seulement après
// une confirmation INTÉGRÉE (usePrompt, jamais un dialogue natif), et « Revenir en lecture
// seule » retire le header d'écriture.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { revokeViewAsWrite, setViewUser, viewHeaders, requestViewAsWrite } from '@/lib/viewOrg'

const confirmAction = vi.fn(async (_cfg: { title: string; message?: string }) => true)
vi.mock('@/composables/usePrompt', () => ({ usePrompt: () => ({ confirmAction }) }))

let cleanup: (() => void) | null = null

async function mountBanner() {
  const ViewAsBanner = (await import('./ViewAsBanner.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(ViewAsBanner)
  app.mount(host)
  await nextTick()
  cleanup = () => { app.unmount(); host.remove() }
  return host
}

async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)) }

beforeEach(() => {
  revokeViewAsWrite()
  localStorage.clear()
  confirmAction.mockClear()
  confirmAction.mockResolvedValue(true)
})
afterEach(() => { cleanup?.(); cleanup = null })

describe('ViewAsBanner — écrire en tant que', () => {
  it('pas de bouton d\'écriture pour un opérateur non super_admin', async () => {
    setViewUser({ sub: 'u1', name: 'Alice', operator: { name: 'Op', superAdmin: false } })
    const host = await mountBanner()
    expect(host.querySelector('[data-test="viewas-write"]')).toBeNull()
    expect(host.textContent).toContain('lecture seule')
  })

  it('pas de bouton d\'écriture sur une vue posée avant la fonction (sans opérateur)', async () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    const host = await mountBanner()
    expect(host.querySelector('[data-test="viewas-write"]')).toBeNull()
  })

  it('super_admin : confirmation intégrée, puis header d\'écriture et bandeau en mode écriture', async () => {
    setViewUser({ sub: 'u1', name: 'Alice', operator: { name: 'Op', superAdmin: true } })
    const host = await mountBanner()
    expect(viewHeaders()['X-Oto-View-As-Write']).toBeUndefined()
    ;(host.querySelector('[data-test="viewas-write"]') as HTMLButtonElement).click()
    await flush()
    expect(confirmAction).toHaveBeenCalledTimes(1)
    const cfg = confirmAction.mock.calls[0]![0]
    expect(cfg.message).toContain('par Op en tant que Alice')
    expect(viewHeaders()['X-Oto-View-As-Write']).toBe('1')
    expect(host.textContent).toContain('tu écris en tant que')
    ;(host.querySelector('[data-test="viewas-readonly"]') as HTMLButtonElement).click()
    await nextTick()
    expect(viewHeaders()['X-Oto-View-As-Write']).toBeUndefined()
    expect(host.textContent).toContain('lecture seule')
  })

  it('super_admin qui refuse la confirmation : rien ne change', async () => {
    confirmAction.mockResolvedValue(false)
    setViewUser({ sub: 'u1', name: 'Alice', operator: { name: 'Op', superAdmin: true } })
    const host = await mountBanner()
    ;(host.querySelector('[data-test="viewas-write"]') as HTMLButtonElement).click()
    await flush()
    expect(viewHeaders()['X-Oto-View-As-Write']).toBeUndefined()
  })

  it('un refus view_as_read_only propose le geste au super_admin, pas à un opérateur', async () => {
    setViewUser({ sub: 'u1', name: 'Alice', operator: { name: 'Op', superAdmin: false } })
    await mountBanner()
    requestViewAsWrite()
    await flush()
    expect(confirmAction).not.toHaveBeenCalled()
    cleanup?.(); cleanup = null
    setViewUser({ sub: 'u1', name: 'Alice', operator: { name: 'Op', superAdmin: true } })
    await mountBanner()
    requestViewAsWrite()
    await flush()
    expect(confirmAction).toHaveBeenCalledTimes(1)
  })
})
