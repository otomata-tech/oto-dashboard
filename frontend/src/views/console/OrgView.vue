<script setup lang="ts">
// « Membres » de l'org active (/org, racine du scope org). UNE page = UN sujet : ici les
// gens (membres + invitations en attente). Profil/logo/entitlements/danger vivent sur
// « paramètres », la MFA sur « sécurité », le readme sur « contexte », les clés partagées
// sur « connecteurs ». Le backend porte l'autz ; `isOrgAdmin` masque les contrôles.
// Les invitations vivent dans la carte partagée `InvitationsCard` (feature cascade — même
// carte au niveau org / équipe / plateforme).
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import Avatar from '@/components/console/Avatar.vue'
import InvitationsCard from '@/components/console/InvitationsCard.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useOrgScope } from '@/composables/useOrgScope'
import { setOrgMemberRole, removeOrgMember } from '@/api/console'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()

const { activeOrgId, meSub, detail, error, loaded, isOrgAdmin, reload } = useOrgScope()

async function toggleRole(sub: string, role: string) {
  const next = role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setOrgMemberRole(activeOrgId.value!, sub, next); toast('role updated'); await reload() }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(sub: string, label: string) {
  if (!await confirmAction({ title: 'remove member', danger: true, confirmLabel: 'remove',
    message: `remove ${label} from this org? they lose access to its shared keys and tools.` })) return
  try { await removeOrgMember(activeOrgId.value!, sub); toast('member removed'); await reload() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="no active org">
      <div class="helptext">you're not in an organization yet. an org admin can invite you, or the studio can create one.</div>
    </ConsoleCard>

    <template v-else>
      <ConsoleCard title="members" flush sub="people in your active org. shared keys & connector governance live in « connectors ».">
        <table class="tbl">
          <thead><tr><th>member</th><th>role</th><th>active</th><th v-if="isOrgAdmin" style="width: 150px"></th></tr></thead>
          <tbody>
            <tr v-for="m in detail?.members ?? []" :key="m.sub">
              <td>
                <div style="display: flex; align-items: center; gap: 9px">
                  <Avatar :src="m.avatar_url" :name="m.name || m.email" :size="28" />
                  <div>
                    <div style="font-weight: 600; color: var(--color-ink)">{{ m.name || m.email }}</div>
                    <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
                  </div>
                </div>
              </td>
              <td><Tag v-if="m.role === 'org_admin'" tone="ink">admin</Tag><Tag v-else>member</Tag></td>
              <td><Dot :tone="m.active ? 'olive' : 'faint'" :size="7" /></td>
              <td v-if="isOrgAdmin" style="text-align: right">
                <div v-if="m.sub !== meSub" style="display: flex; gap: 6px; justify-content: flex-end">
                  <Btn kind="mini" @click="toggleRole(m.sub, m.role)">{{ m.role === 'org_admin' ? 'demote' : 'promote' }}</Btn>
                  <Btn kind="danger" @click="removeMember(m.sub, m.name || m.email || 'this member')">remove</Btn>
                </div>
                <span v-else class="dim" style="font-size: 11px">you</span>
              </td>
            </tr>
          </tbody>
        </table>
      </ConsoleCard>

      <InvitationsCard v-if="activeOrgId != null && isOrgAdmin"
        :scope="{ level: 'org', id: activeOrgId }" :can-manage="isOrgAdmin" />
    </template>
  </div>
</template>
