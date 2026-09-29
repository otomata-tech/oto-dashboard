// Le menu « choisir un membre… » du partage (29/09/2026, Movinmotion) : il s'ouvrait en
// un trait sous le champ, car la liste était VIDE — une lecture en échec avalée en `[]`,
// ou un espace perso sans autre membre — et un menu vide n'a pas de hauteur. Désormais
// l'échec se dit dans le dialogue, et le menu vide dit pourquoi il l'est.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { i18n } from '@/lib/i18n'
import { ApiError } from '@/api'

const api = vi.hoisted(() => ({
  getOrg: vi.fn(), listGroups: vi.fn(), getMyOrgs: vi.fn(),
  shareResource: vi.fn(), unshareResource: vi.fn(), publishProjectMcp: vi.fn(), unpublishProjectMcp: vi.fn(),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
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
  me.value = { sub: 'moi', active_org: 35, active_org_name: 'movinmotion', active_org_is_personal: false }
  api.getOrg.mockResolvedValue({ org: { id: 35 }, members: [
    { sub: 'moi', email: 'moi@m.com' }, { sub: 'a', email: 'a@m.com', name: 'Céleste' }] })
  api.listGroups.mockResolvedValue({ groups: [] })
  api.getMyOrgs.mockResolvedValue({ orgs: [{ id: 35, name: 'movinmotion' }] })
})

async function monterDialogue() {
  const C = (await import('./ProjectShareDialog.vue')).default
  const open = ref(false)
  const hote = document.createElement('div'); document.body.appendChild(hote)
  const { h } = await import('vue')
  const racine = createApp({ setup: () => () => h(C, { open: open.value, project: PROJET as any, grants: [] }) })
  racine.use(i18n); racine.mount(hote)
  demonter = () => racine.unmount()
  open.value = true   // l'app ouvre le dialogue après l'avoir monté fermé
  await vider()
  return document.body
}

describe('partage : les listes du dialogue', () => {
  it('une lecture en échec se DIT dans le dialogue, avec sa raison', async () => {
    api.getOrg.mockRejectedValue(new ApiError(500, 'boom', 'internal_error'))
    const b = await monterDialogue()
    const err = b.querySelector('[data-test="pickers-error"]')
    expect(err?.textContent).toContain('impossible de charger les membres')
  })

  it('espace perso sans autre membre : le menu des membres dit où partager', async () => {
    me.value = { ...me.value, active_org: 181, active_org_is_personal: true }
    api.getOrg.mockResolvedValue({ org: { id: 181 }, members: [{ sub: 'moi', email: 'moi@m.com' }] })
    const b = await monterDialogue()
    const menus = b.querySelectorAll('.sd__add button[role="combobox"]')
    menus[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vider()
    expect(b.querySelector('[data-test="select-empty"]')?.textContent).toContain('ton espace perso n')
  })

  it('les listes lues : aucune erreur affichée', async () => {
    const b = await monterDialogue()
    expect(b.querySelector('[data-test="pickers-error"]')).toBeNull()
    expect(api.getOrg).toHaveBeenCalledWith(35)
  })
})

describe('OtoSelect : un menu sans choix dit pourquoi', () => {
  async function monterSelect(props: Record<string, unknown>) {
    const C = (await import('../OtoSelect.vue')).default
    const { h } = await import('vue')
    const hote = document.createElement('div'); document.body.appendChild(hote)
    const app = createApp({ setup: () => () => h(C as any, { modelValue: '', ...props }) })
    app.mount(hote)
    demonter = () => app.unmount()
    const trig = hote.querySelector('button[role="combobox"]') as HTMLButtonElement
    trig.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vider()
    return document.body
  }
  it('options vides + emptyLabel : la phrase est dans le menu ouvert', async () => {
    const b = await monterSelect({ options: [], emptyLabel: 'aucun autre membre dans cette org' })
    expect(b.querySelector('[data-test="select-empty"]')?.textContent).toBe('aucun autre membre dans cette org')
  })
  it('des options : pas de phrase de vide', async () => {
    const b = await monterSelect({ options: [{ value: 'a', label: 'A' }], emptyLabel: 'vide' })
    expect(b.querySelector('[data-test="select-empty"]')).toBeNull()
    expect(b.querySelectorAll('[role="option"]').length).toBe(1)
  })
})
