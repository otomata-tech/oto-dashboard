// Invitation à une ÉQUIPE (revenue le 23/09/2026) : le même composable que l'org et la
// plateforme, avec sa propre triade de routes. Ce test tient le câblage niveau → route.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const api = vi.hoisted(() => ({
  listInvitations: vi.fn(async () => ({ invitations: [] })),
  inviteMember: vi.fn(async () => ({})),
  revokeInvitation: vi.fn(async () => ({})),
  listGroupInvitations: vi.fn(async () => ({ invitations: [{ id: 7, email: 'a@b.fr', org_role: 'org_member', group_role: 'group_admin' }] })),
  inviteToGroup: vi.fn(async () => ({ ok: true, email: 'a@b.fr', role: 'group_admin', invite_url: 'u', emailed: true })),
  revokeGroupInvitation: vi.fn(async () => ({})),
  listPlatformInvitations: vi.fn(async () => ({ invitations: [] })),
  invitePlatformUser: vi.fn(async () => ({})),
  revokePlatformInvitation: vi.fn(async () => ({})),
}))
vi.mock('@/api/console', () => api)

import { useInvitations, type InviteScope } from './useInvitations'

async function settle() { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() } }

describe('useInvitations — niveau équipe', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('lit, invite et révoque par les routes de L’ÉQUIPE, jamais celles de l’org', async () => {
    const scope = ref<InviteScope | null>({ level: 'team', id: 12 })
    const inv = useInvitations(scope, ref(true))
    await settle()
    expect(api.listGroupInvitations).toHaveBeenCalledWith(12)
    expect(inv.invitations.value).toHaveLength(1)

    await inv.invite('a@b.fr', 'group_admin', true)
    expect(api.inviteToGroup).toHaveBeenCalledWith(12, 'a@b.fr', 'group_admin', true)

    await inv.revoke(7)
    expect(api.revokeGroupInvitation).toHaveBeenCalledWith(12, 7)
    expect(api.listInvitations).not.toHaveBeenCalled()
    expect(api.inviteMember).not.toHaveBeenCalled()
  })

  it('sans le droit de lire, rien n’est demandé au serveur', async () => {
    useInvitations(ref<InviteScope | null>({ level: 'team', id: 12 }), ref(false))
    await settle()
    expect(api.listGroupInvitations).not.toHaveBeenCalled()
  })
})
