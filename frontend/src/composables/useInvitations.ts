import { ref, watch, type Ref } from 'vue'
import {
  listInvitations, inviteMember, revokeInvitation,
  listGroupInvitations, inviteGroupMember, revokeGroupInvitation,
  listPlatformInvitations, invitePlatformUser, revokePlatformInvitation,
} from '@/api/console'
import type { OrgInvitation, OrgRole, GroupRole, InviteResult } from '@/types/api'
import { humanize } from '@/lib/errors'

// Feature INVITE en cascade (plateforme / org / équipe) — même geste à 3 niveaux, comme
// la gouvernance connecteurs. Ce composable est le SEUL point de câblage API : il choisit
// la triade (lister / inviter / révoquer) selon le niveau, le composant reste identique.
// Un `id` est requis pour org/équipe (jamais pour plateforme).
export type InviteScope =
  | { level: 'org'; id: number }
  | { level: 'team'; id: number }
  | { level: 'platform' }

export function useInvitations(scope: Ref<InviteScope | null>, enabled: Ref<boolean>) {
  const invitations = ref<OrgInvitation[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function reload() {
    const s = scope.value
    if (!enabled.value || !s) { invitations.value = []; return }
    loading.value = true
    error.value = null
    try {
      if (s.level === 'org') invitations.value = (await listInvitations(s.id)).invitations
      else if (s.level === 'team') invitations.value = (await listGroupInvitations(s.id)).invitations
      else invitations.value = (await listPlatformInvitations()).invitations
    } catch (e) { error.value = humanize(e); invitations.value = [] }
    finally { loading.value = false }
  }

  // Émet une invitation. `role` porte le vocabulaire du niveau (org_* ou group_*) ;
  // ignoré au niveau plateforme (onboarding pur). Renvoie le lien/code à partager.
  async function invite(
    email: string | null, role: string, sendEmail: boolean,
  ): Promise<InviteResult & { role: string }> {
    const s = scope.value
    if (!s) throw new Error('no scope')
    if (s.level === 'org') return inviteMember(s.id, email, role as OrgRole, sendEmail)
    if (s.level === 'team') return inviteGroupMember(s.id, email, role as GroupRole, sendEmail)
    return invitePlatformUser(email, { sendEmail })
  }

  async function revoke(inviteId: number): Promise<void> {
    const s = scope.value
    if (!s) return
    if (s.level === 'org') await revokeInvitation(s.id, inviteId)
    else if (s.level === 'team') await revokeGroupInvitation(s.id, inviteId)
    else await revokePlatformInvitation(inviteId)
  }

  watch([scope, enabled], reload, { immediate: true, deep: true })

  return { invitations, loading, error, reload, invite, revoke }
}
