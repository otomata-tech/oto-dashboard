<script setup lang="ts">
// « Membres » de l'org active (/org, racine du scope org). UNE page = UN sujet : ici les
// gens (membres + invitations en attente). Profil/logo/entitlements/danger vivent sur
// « paramètres », la MFA sur « sécurité », le readme sur « contexte », les clés partagées
// sur « connecteurs ». Le backend porte l'autz ; `isOrgAdmin` masque les contrôles.
import { ref, watch } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Avatar from '@/components/console/Avatar.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useOrgScope } from '@/composables/useOrgScope'
import { setOrgMemberRole, removeOrgMember, listInvitations, inviteMember, revokeInvitation } from '@/api/console'
import type { OrgInvitation, OrgRole } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
// Dialog séparé pour la révélation lien/code (évite la course de fermeture du 1er).
const { formDialog: revealDialog, formDialogOpen: revealOpen, openForm: openReveal } = useFormDialog()

const { activeOrgId, meSub, detail, error, loaded, isOrgAdmin, reload } = useOrgScope()

const invites = ref<OrgInvitation[]>([])

async function loadInvites() {
  if (!isOrgAdmin.value || activeOrgId.value == null) { invites.value = []; return }
  try { invites.value = (await listInvitations(activeOrgId.value)).invitations }
  catch { invites.value = [] }
}
// Recharge les invitations dès que le détail (donc isOrgAdmin) est résolu.
watch(loaded, (ok) => { if (ok) loadInvites() }, { immediate: true })
async function refresh() { await reload(); await loadInvites() }

function invite() {
  openForm({
    title: 'invite a teammate',
    description: 'send them an email link, or get a code to share yourself.',
    submitLabel: 'create invite',
    fields: [
      { key: 'email', label: 'email (optional)', placeholder: 'name@company.com',
        hint: 'leave blank to get a code to share yourself' },
      { key: 'role', label: 'role', type: 'select', initial: 'org_member',
        options: [{ value: 'org_member', label: 'member' }, { value: 'org_admin', label: 'admin' }] },
      { key: 'delivery', label: 'how', type: 'select', initial: 'mail',
        options: [{ value: 'mail', label: 'send by email' }, { value: 'code', label: 'give me a code to share' }] },
    ],
    onConfirm: async (v) => {
      const sendMail = v.delivery !== 'code'
      const email = (v.email || '').trim()
      if (sendMail && !email) { toast('an email is required to send by email'); throw new Error('email required') }
      const role: OrgRole = v.role === 'org_admin' ? 'org_admin' : 'org_member'
      try {
        const res = await inviteMember(activeOrgId.value!, email || null, role, sendMail)
        if (res.emailed) {
          toast(`invite sent to ${res.email}`)
        } else {
          openReveal({
            title: 'share this invite yourself',
            description: 'send this link (or code) to the person — it joins them to this org.',
            submitLabel: 'done',
            fields: [
              { key: 'url', label: 'invite link', initial: res.invite_url },
              { key: 'code', label: 'code', initial: res.code },
            ],
            onConfirm: async () => {},
          })
        }
        await loadInvites()
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function revokeInv(id: number) {
  if (!await confirmAction({ title: 'revoke invitation', danger: true, confirmLabel: 'revoke', message: 'revoke this pending invitation?' })) return
  try { await revokeInvitation(activeOrgId.value!, id); toast('invitation revoked'); await loadInvites() }
  catch (e) { toast(humanize(e)) }
}
async function toggleRole(sub: string, role: string) {
  const next = role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setOrgMemberRole(activeOrgId.value!, sub, next); toast('role updated'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(sub: string, label: string) {
  if (!await confirmAction({ title: 'remove member', danger: true, confirmLabel: 'remove',
    message: `remove ${label} from this org? they lose access to its shared keys and tools.` })) return
  try { await removeOrgMember(activeOrgId.value!, sub); toast('member removed'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="no active org">
      <div class="helptext">you're not in an organization yet. an org admin can invite you, or the studio can create one.</div>
    </ConsoleCard>

    <ConsoleCard v-else title="members" flush sub="people in your active org — plus pending invites. shared keys & connector governance live in « connectors ».">
      <template v-if="isOrgAdmin" #actions>
        <Btn kind="mini" icon="plus" @click="invite">Ajouter</Btn>
      </template>
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
          <!-- Invitations en attente = lignes de la même liste (pas de carte séparée) :
               « rejoindront l'org au clic sur le lien ». Admin only (loadInvites gaté). -->
          <tr v-for="iv in invites" :key="iv.id">
            <td>
              <div style="display: flex; align-items: center; gap: 9px">
                <Avatar :name="iv.email" :size="28" />
                <div>
                  <div style="font-weight: 600; color: var(--color-ink); display: flex; gap: 6px; align-items: center">
                    {{ iv.email }} <Tag tone="saffron">invité</Tag>
                  </div>
                  <div style="font-size: 11px; color: var(--color-faint)">invité {{ fmtDate(iv.created_at) }} · expire {{ fmtDate(iv.expires_at) }}</div>
                </div>
              </div>
            </td>
            <td><Tag v-if="iv.org_role === 'org_admin'" tone="ink">admin</Tag><Tag v-else>member</Tag></td>
            <td><Dot tone="saffron" :size="7" /></td>
            <td v-if="isOrgAdmin" style="text-align: right">
              <Btn kind="danger" @click="revokeInv(iv.id)">revoke</Btn>
            </td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
    <FormDialog v-if="revealDialog" v-model:open="revealOpen"
      :title="revealDialog.title" :description="revealDialog.description"
      :fields="revealDialog.fields" :submit-label="revealDialog.submitLabel" :on-confirm="revealDialog.onConfirm" />
  </div>
</template>
