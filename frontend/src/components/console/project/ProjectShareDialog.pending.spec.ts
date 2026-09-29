// Partager un projet avec une adresse SANS compte oto (29/09/2026) : le backend ne rend
// plus « utilisateur inconnu » — il pose un partage EN ATTENTE (invitation envoyée,
// accès à ce projet seul à l'inscription, jamais l'org). Le dialogue doit le DIRE, et
// lister le partage en attente, marqué et retirable.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { i18n } from '@/lib/i18n'
import type { NamespaceShare } from '@/types/api'

const api = vi.hoisted(() => ({
  getOrg: vi.fn(), listGroups: vi.fn(), getMyOrgs: vi.fn(),
  shareResource: vi.fn(), unshareResource: vi.fn(), publishProjectMcp: vi.fn(), unpublishProjectMcp: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const toast = vi.fn()
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast }) }))
vi.mock('@/composables/usePrompt', () => ({ usePrompt: () => ({ confirmAction: vi.fn() }) }))
vi.mock('@/composables/useTransferOwnership', () => ({ useTransferOwnership: () => ({ transfer: vi.fn() }) }))
const me = ref<Record<string, unknown>>({})
vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me }) }))

const PROJET = { id: 7, name: 'Prospection', owner_type: 'org', owner_id: '35', mcp_access: 'off', links: [] }
const vider = async () => { for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick() } }
let demonter: (() => void) | null = null
afterEach(() => { demonter?.(); demonter = null; document.body.innerHTML = '' })
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  me.value = { sub: 'moi', active_org: 35, active_org_name: 'acme', active_org_is_personal: false }
  api.getOrg.mockResolvedValue({ org: { id: 35 }, members: [
    { sub: 'moi', email: 'moi@a.test' }, { sub: 'a', email: 'a@a.test', name: 'Céleste' }] })
  api.listGroups.mockResolvedValue({ groups: [] })
  api.getMyOrgs.mockResolvedValue({ orgs: [{ id: 35, name: 'acme' }] })
})

async function monterDialogue(grants: NamespaceShare[] = []) {
  const C = (await import('./ProjectShareDialog.vue')).default
  const open = ref(false)
  const hote = document.createElement('div'); document.body.appendChild(hote)
  const { h } = await import('vue')
  const racine = createApp({ setup: () => () => h(C, { open: open.value, project: PROJET as any, grants }) })
  racine.use(i18n); racine.mount(hote)
  demonter = () => racine.unmount()
  open.value = true
  await vider()
  return document.body
}

// Choisit un membre dans le 2ᵉ menu (le mode « membre » est celui d'ouverture).
async function choisirMembre(b: HTMLElement) {
  const menus = b.querySelectorAll('.sd__add button[role="combobox"]')
  menus[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await vider()
  const option = [...b.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('Céleste'))
  option!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await vider()
}

async function partager(b: HTMLElement) {
  const bouton = [...b.querySelectorAll('.sd__add button')].find((x) => x.textContent?.includes('Partager'))
  expect(bouton, 'le bouton dit « Partager », plus « Inviter »').toBeTruthy()
  ;(bouton as HTMLButtonElement).click()
  await vider()
}

describe('partage en attente : une adresse sans compte', () => {
  it('le partage en attente se DIT dans le dialogue, pas dans un toast', async () => {
    api.shareResource.mockResolvedValue({ ok: true, pending: true, already_pending: false })
    const b = await monterDialogue()
    await choisirMembre(b)
    await partager(b)
    expect(api.shareResource).toHaveBeenCalled()
    const note = b.querySelector('[data-test="pending-note"]')
    expect(note?.textContent).toContain("n'a pas encore de compte oto")
    expect(note?.textContent).toContain("rien d'autre")
    expect(toast).not.toHaveBeenCalled()
  })

  it('un partage déjà en attente le dit aussi', async () => {
    api.shareResource.mockResolvedValue({ ok: true, pending: true, already_pending: true })
    const b = await monterDialogue()
    await choisirMembre(b)
    await partager(b)
    expect(b.querySelector('[data-test="pending-note"]')?.textContent).toContain('déjà un partage en attente')
  })

  it('un partage à un compte existant reste un toast, sans note', async () => {
    api.shareResource.mockResolvedValue({ ok: true })
    const b = await monterDialogue()
    await choisirMembre(b)
    await partager(b)
    expect(b.querySelector('[data-test="pending-note"]')).toBeNull()
    expect(toast).toHaveBeenCalled()
  })

  it('la liste marque le partage en attente, et il se retire par son adresse', async () => {
    api.unshareResource.mockResolvedValue({ ok: true, removed: true })
    const b = await monterDialogue([{ principal_type: 'user', principal_id: null, email: 'k@b.test',
      label: 'k@b.test', role: 'viewer', permission: 'read', pending: true }])
    expect(b.querySelector('[data-test="pending-tag"]')?.textContent).toContain('en attente')
    ;(b.querySelector('.sd__rev') as HTMLButtonElement).click()
    await vider()
    expect(api.unshareResource).toHaveBeenCalledWith('project', '7', { email: 'k@b.test' })
  })
})
