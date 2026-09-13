// Qui voit les gestes du roster des équipes, rôle par rôle (oto#210).
//
// Côté serveur (oto-backend, relu sur origin/main le 13/09) : créer une équipe exige l'admin
// d'org (`ORG_ADMIN_OF`), la renommer ou la supprimer l'admin de l'équipe ou de l'org
// (`GROUP_ADMIN_OF`). L'admin d'org, pour le serveur, c'est l'org_admin et le super_admin
// (`roles.is_org_admin`) — JAMAIS l'`admin` plateforme, qui LIT la liste (`ORG_MEMBER_OF`, en
// consultation) mais prendrait 403 sur chacun de ces boutons.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'

const api = vi.hoisted(() => ({
  listGroups: vi.fn(), createGroup: vi.fn(), updateGroup: vi.fn(), deleteGroup: vi.fn(),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
const me = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me }),
}))
vi.mock('@/components/console/FormDialog.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ render: () => h('div') }) }
})

async function settle() {
  for (let i = 0; i < 6; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 6; i++) await nextTick()
}

async function boutons(role: string, org_role: string | null): Promise<string[]> {
  me.value = { sub: 'u-test', role, org_role, active_org: 42 }
  const View = (await import('./GroupsView.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.mount(host)
  await settle()
  const out = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
  app.unmount()
  host.remove()
  return out
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listGroups.mockResolvedValue({
    groups: [{ id: 7, name: 'ventes', description: '', member_count: 3, my_role: null }],
  })
})

describe('GroupsView — les gestes suivent la règle du serveur (oto#210)', () => {
  it.each([
    ['org_admin', 'member', 'org_admin', ['New', 'Edit', 'Delete']],
    ['membre simple', 'member', 'org_member', []],
    ["admin plateforme, membre de l'org", 'admin', 'org_member', []],
    ["admin plateforme qui consulte l'org", 'admin', null, []],
    ['super_admin', 'super_admin', null, ['New', 'Edit', 'Delete']],
  ])('%s : %j', async (_nom, role, orgRole, attendus) => {
    expect(await boutons(role, orgRole)).toEqual(attendus)
  })

  it("la liste reste lue pour l'admin plateforme : seuls les gestes disparaissent", async () => {
    me.value = { sub: 'u-test', role: 'admin', org_role: null, active_org: 42 }
    const View = (await import('./GroupsView.vue')).default
    const host = document.createElement('div')
    const app = createApp(View)
    app.mount(host)
    await settle()
    expect(api.listGroups).toHaveBeenCalledWith(42)
    expect(host.textContent).toContain('ventes')
    app.unmount()
  })
})
