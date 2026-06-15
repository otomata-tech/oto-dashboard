<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import { getMyOrgs, getOrg, setOrgMemberRole, deleteOrgSecret,
  listInvitations, inviteMember, revokeInvitation } from '@/api/console'
import type { Org, OrgDetail, OrgInvitation, OrgRole } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction, promptForm } = usePrompt()
const { me } = useMe()

const orgs = ref<Org[]>([])
const detail = ref<OrgDetail | null>(null)
const invites = ref<OrgInvitation[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

const isOrgAdmin = computed(() => detail.value?.org.my_role === 'org_admin')
const activeOrgId = computed(() => me.value?.active_org ?? null)
const meSub = computed(() => me.value?.sub ?? null)

async function loadInvites() {
  if (!isOrgAdmin.value || activeOrgId.value == null) { invites.value = []; return }
  try { invites.value = (await listInvitations(activeOrgId.value)).invitations }
  catch { invites.value = [] }
}

async function load() {
  try {
    orgs.value = (await getMyOrgs()).orgs
    if (activeOrgId.value != null) {
      detail.value = await getOrg(activeOrgId.value)
      await loadInvites()
    }
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

async function invite() {
  const r = await promptForm({
    title: 'invite a teammate',
    description: 'they receive an email link to join this org.',
    fields: [
      { key: 'email', label: 'email', placeholder: 'name@company.com' },
      { key: 'role', label: 'role', value: 'org_member',
        options: [{ value: 'org_member', label: 'member' }, { value: 'org_admin', label: 'admin' }] },
    ],
    submitLabel: 'send invite',
  })
  if (!r || !r.email) return
  const role: OrgRole = r.role === 'org_admin' ? 'org_admin' : 'org_member'
  try {
    const res = await inviteMember(activeOrgId.value!, r.email, role)
    toast(res.emailed ? `invite sent to ${res.email}` : 'invite created — share the link')
    if (!res.emailed) {
      await promptForm({
        title: 'share this invite link',
        description: 'email delivery is off on this server — copy and send it yourself.',
        fields: [{ key: 'url', label: 'invite link', value: res.invite_url }],
        submitLabel: 'done',
      })
    }
    await loadInvites()
  } catch (e) { toast(humanize(e)) }
}
async function revokeInv(id: number) {
  if (!await confirmAction({ title: 'revoke invitation', danger: true, confirmLabel: 'revoke', message: 'revoke this pending invitation?' })) return
  try { await revokeInvitation(activeOrgId.value!, id); toast('invitation revoked'); await loadInvites() }
  catch (e) { toast(humanize(e)) }
}

async function toggleRole(sub: string, role: string) {
  const next = role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setOrgMemberRole(activeOrgId.value!, sub, next); toast('role updated'); detail.value = await getOrg(activeOrgId.value!) }
  catch (e) { toast(humanize(e)) }
}
async function removeSecret(provider: string) {
  if (!await confirmAction({ title: 'remove shared key', danger: true, confirmLabel: 'remove', message: `remove the shared ${provider} key?` })) return
  try { await deleteOrgSecret(activeOrgId.value!, provider); toast('shared key removed'); detail.value = await getOrg(activeOrgId.value!) }
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
      <div class="grid23">
        <ConsoleCard title="members" flush sub="people in your active org. org admins can edit doctrine and shared keys.">
          <table class="tbl">
            <thead><tr><th>member</th><th>role</th><th>active</th><th v-if="isOrgAdmin" style="width: 90px"></th></tr></thead>
            <tbody>
              <tr v-for="m in detail?.members ?? []" :key="m.sub">
                <td>
                  <div style="font-weight: 600; color: var(--color-ink)">{{ m.name || m.email }}</div>
                  <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
                </td>
                <td><Tag v-if="m.role === 'org_admin'" tone="ink">admin</Tag><Tag v-else>member</Tag></td>
                <td><Dot :tone="m.active ? 'olive' : 'faint'" :size="7" /></td>
                <td v-if="isOrgAdmin" style="text-align: right">
                  <Btn v-if="m.sub !== meSub" kind="mini" @click="toggleRole(m.sub, m.role)">{{ m.role === 'org_admin' ? 'demote' : 'promote' }}</Btn>
                  <span v-else class="dim" style="font-size: 11px">you</span>
                </td>
              </tr>
            </tbody>
          </table>
        </ConsoleCard>

        <div style="display: flex; flex-direction: column; gap: 16px">
          <ConsoleCard title="your orgs">
            <div class="rowlist">
              <div v-for="o in orgs" :key="o.id" class="rowitem">
                <Dot :tone="o.id === activeOrgId ? 'saffron' : 'faint'" :size="8" />
                <div style="flex: 1">
                  <div style="font-weight: 600; font-size: 13px">{{ o.name }}</div>
                  <div style="font-size: 11px; color: var(--color-faint)">{{ o.member_count }} members · you are {{ o.my_role === 'org_admin' ? 'admin' : 'member' }}</div>
                </div>
                <Tag v-if="o.id === activeOrgId" tone="saffron">active</Tag>
              </div>
              <div v-if="!orgs.length" class="helptext">no orgs.</div>
            </div>
          </ConsoleCard>
          <ConsoleCard v-if="detail?.entitlements?.length" title="entitlements" sub="controlled namespaces unlocked for this org.">
            <div class="rowlist">
              <div v-for="e in detail.entitlements" :key="e.namespace" class="rowitem">
                <Tag tone="cobalt">{{ e.namespace }}</Tag>
                <span style="margin-left: auto; font-size: 11px; color: var(--color-faint)">{{ fmtDate(e.granted_at) }}</span>
              </div>
            </div>
          </ConsoleCard>
        </div>
      </div>

      <ConsoleCard v-if="isOrgAdmin" title="invitations"
        sub="invite teammates by email — they join this org when they accept the link.">
        <template #actions>
          <Btn kind="mini" icon="plus" @click="invite">invite</Btn>
        </template>
        <div class="rowlist">
          <div v-for="iv in invites" :key="iv.id" class="rowitem" style="gap: 12px">
            <Dot tone="saffron" :size="8" />
            <div style="min-width: 0; flex: 1">
              <div style="font-weight: 600; font-size: 13px; display: flex; gap: 8px; align-items: center">
                {{ iv.email }} <Tag :tone="iv.org_role === 'org_admin' ? 'ink' : undefined">{{ iv.org_role === 'org_admin' ? 'admin' : 'member' }}</Tag>
              </div>
              <div style="font-size: 11.5px; color: var(--color-mute)">invited {{ fmtDate(iv.created_at) }} · expires {{ fmtDate(iv.expires_at) }}</div>
            </div>
            <Btn kind="danger" @click="revokeInv(iv.id)">revoke</Btn>
          </div>
          <div v-if="!invites.length" class="helptext">no pending invitations — invite a teammate to get started.</div>
        </div>
      </ConsoleCard>

      <ConsoleCard title="shared keys" flush
        sub="org-level credentials every member inherits. per-user sessions (linkedin, google) are never shared.">
        <table class="tbl">
          <thead><tr><th>provider</th><th>type</th><th>set by</th><th>since</th><th v-if="isOrgAdmin" style="width: 90px"></th></tr></thead>
          <tbody>
            <tr v-for="s in detail?.secrets ?? []" :key="s.provider">
              <td style="font-weight: 600; color: var(--color-ink)">{{ s.provider }}</td>
              <td><Tag v-if="s.base_url" tone="cobalt">remote bridge</Tag><Tag v-else>api key</Tag></td>
              <td class="dim">{{ s.set_by ?? '—' }}</td>
              <td class="dim">{{ fmtDate(s.set_at) ?? '—' }}</td>
              <td v-if="isOrgAdmin" style="text-align: right"><Btn kind="danger" @click="removeSecret(s.provider)">remove</Btn></td>
            </tr>
            <tr v-if="!(detail?.secrets?.length)"><td :colspan="isOrgAdmin ? 5 : 4" class="dim" style="text-align: center; padding: 16px">no shared keys yet</td></tr>
          </tbody>
        </table>
      </ConsoleCard>
    </template>
  </div>
</template>
