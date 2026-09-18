// Membres d'une équipe (oto#192, réintroduit — cf. TeamDetailView) : les gestes d'écriture
// (add/role/remove) suivent `can-manage`, jamais le rôle seul — même règle que le reste de
// la console (oto#210/#211), portée ici par le PARENT (TeamDetailView), pas ce composant.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

const api = vi.hoisted(() => ({
  addGroupMember: vi.fn(), setGroupMemberRole: vi.fn(), removeGroupMember: vi.fn(), getOrg: vi.fn(),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/composables/usePrompt', () => ({ usePrompt: () => ({ confirmAction: vi.fn().mockResolvedValue(true) }) }))
vi.mock('@/components/console/FormDialog.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ render: () => h('div') }) }
})

async function settle() {
  for (let i = 0; i < 6; i++) await nextTick()
}

const membres = [
  { sub: 'u-lead', email: 'lead@example.com', name: null, role: 'group_admin' as const, active: true },
  { sub: 'u-membre', email: 'membre@example.com', name: null, role: 'group_member' as const, active: true },
]

async function boutons(canManage: boolean, meSub: string | null = 'u-autre') {
  const { default: TeamMembersCard } = await import('./TeamMembersCard.vue')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(TeamMembersCard, {
    groupId: 3, orgId: 35, members: membres, canManage, meSub,
  })
  app.mount(host)
  await settle()
  const out = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
  app.unmount()
  host.remove()
  return out
}

beforeEach(() => vi.clearAllMocks())

describe('TeamMembersCard — les gestes d\'écriture suivent can-manage', () => {
  it('can-manage=false : aucun bouton de geste, juste la liste', async () => {
    expect(await boutons(false)).toEqual([])
  })

  it("can-manage=true : Add member, et par ligne Make lead/Demote + Remove", async () => {
    const out = await boutons(true)
    expect(out).toContain('Add member')
    expect(out).toContain('Demote')   // u-lead est déjà lead
    expect(out).toContain('Make lead')   // u-membre ne l'est pas
    expect(out.filter((b) => b === 'Remove')).toHaveLength(2)
  })

  it("can-manage=true : la ligne DE l'appelant n'a pas de bouton (pas de self-demote/self-remove)", async () => {
    const out = await boutons(true, 'u-lead')
    // u-lead ne doit plus porter Demote/Remove pour lui-même — un seul membre restant a ces gestes.
    expect(out.filter((b) => b === 'Remove')).toHaveLength(1)
  })
})
