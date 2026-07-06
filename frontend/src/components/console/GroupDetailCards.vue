<script setup lang="ts">
// Cartes de gestion d'UN groupe (membres + clés partagées) — extrait de GroupsView
// pour être partagé avec MyGroupView (niveau « gérer mon groupe »). « Derive don't
// duplicate » : une seule implémentation des gestes membre/clé, deux points de montage
// (org_admin sur un groupe sélectionné · chef sur son groupe actif). Le parent recharge
// le détail sur `@changed` (les mutations sont keyées par `groupId`).
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import FormDialog from './FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import {
  addGroupMember, setGroupMemberRole, removeGroupMember,
  setGroupSecret, deleteGroupSecret,
} from '@/api/console'
import type { GroupMember, GroupSecret, GroupRole } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const props = defineProps<{
  groupId: number
  members: GroupMember[]
  secrets: GroupSecret[]
  canManage: boolean
  meSub: string | null
}>()
const emit = defineEmits<{ changed: [] }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

function addMember() {
  openForm({
    title: 'add to group',
    description: 'the person must already be a member of the org.',
    fields: [
      { key: 'target', label: 'email or sub', placeholder: 'name@company.com', required: true },
      { key: 'role', label: 'role', type: 'select', initial: 'group_member',
        options: [{ value: 'group_member', label: 'member' }, { value: 'group_admin', label: 'team lead' }] },
    ],
    submitLabel: 'add',
    onConfirm: async (v) => {
      const role: GroupRole = v.role === 'group_admin' ? 'group_admin' : 'group_member'
      try { await addGroupMember(props.groupId, (v.target ?? ''), role); toast('member added'); emit('changed') }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function toggleMemberRole(sub: string, role: GroupRole) {
  const next: GroupRole = role === 'group_admin' ? 'group_member' : 'group_admin'
  try { await setGroupMemberRole(props.groupId, sub, next); toast('role updated'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(sub: string) {
  if (!await confirmAction({ title: 'remove member', danger: true, confirmLabel: 'Remove', message: 'remove this member from the group?' })) return
  try { await removeGroupMember(props.groupId, sub); toast('member removed'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}

function addSecret() {
  openForm({
    title: 'shared key',
    description: 'an org-shareable provider key for this group — resolves before the org key for its members.',
    fields: [
      { key: 'provider', label: 'provider', placeholder: 'attio, pennylane…', required: true },
      { key: 'api_key', label: 'api key', type: 'password', required: true },
      { key: 'base_url', label: 'base url', placeholder: 'remote connectors only (optional)' },
    ],
    submitLabel: 'save key',
    onConfirm: async (v) => {
      try { await setGroupSecret(props.groupId, (v.provider ?? ''), (v.api_key ?? ''), v.base_url || undefined); toast('shared key saved'); emit('changed') }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function removeSecret(provider: string) {
  if (!await confirmAction({ title: 'remove shared key', danger: true, confirmLabel: 'Remove', message: `remove the shared ${provider} key?` })) return
  try { await deleteGroupSecret(props.groupId, provider); toast('shared key removed'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConsoleCard title="members" flush sub="who belongs to this group.">
    <template v-if="canManage" #actions>
      <Btn kind="mini" icon="plus" @click="addMember">Add member</Btn>
    </template>
    <table class="tbl">
      <thead><tr><th>member</th><th>role</th><th v-if="canManage" style="width: 130px"></th></tr></thead>
      <tbody>
        <tr v-for="m in members" :key="m.sub">
          <td>
            <div style="font-weight: 600; color: var(--color-ink)">{{ m.name || m.email }}</div>
            <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
          </td>
          <td><Tag v-if="m.role === 'group_admin'" tone="ink">lead</Tag><Tag v-else>member</Tag></td>
          <td v-if="canManage" style="text-align: right; white-space: nowrap">
            <template v-if="m.sub !== meSub">
              <Btn kind="mini" @click="toggleMemberRole(m.sub, m.role)">{{ m.role === 'group_admin' ? 'Demote' : 'Make lead' }}</Btn>
              <Btn kind="danger" @click="removeMember(m.sub)">Remove</Btn>
            </template>
            <span v-else class="dim" style="font-size: 11px">you</span>
          </td>
        </tr>
        <tr v-if="!members.length"><td :colspan="canManage ? 3 : 2" class="dim" style="text-align: center; padding: 14px">no members</td></tr>
      </tbody>
    </table>
  </ConsoleCard>

  <ConsoleCard title="shared keys" flush
    sub="group-level credentials — resolve before the org key for this team's members.">
    <template v-if="canManage" #actions>
      <Btn kind="mini" icon="plus" @click="addSecret">Add key</Btn>
    </template>
    <table class="tbl">
      <thead><tr><th>provider</th><th>type</th><th>set by</th><th>since</th><th v-if="canManage" style="width: 80px"></th></tr></thead>
      <tbody>
        <tr v-for="s in secrets" :key="s.provider">
          <td style="font-weight: 600; color: var(--color-ink)">{{ s.provider }}</td>
          <td><Tag v-if="s.base_url" tone="cobalt">remote bridge</Tag><Tag v-else>api key</Tag></td>
          <td class="dim">{{ s.set_by ?? '—' }}</td>
          <td class="dim">{{ fmtDate(s.set_at) ?? '—' }}</td>
          <td v-if="canManage" style="text-align: right"><Btn kind="danger" @click="removeSecret(s.provider)">Remove</Btn></td>
        </tr>
        <tr v-if="!secrets.length"><td :colspan="canManage ? 5 : 4" class="dim" style="text-align: center; padding: 14px">no shared keys</td></tr>
      </tbody>
    </table>
  </ConsoleCard>

  <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
    :title="formDialog.title" :description="formDialog.description"
    :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
</template>
