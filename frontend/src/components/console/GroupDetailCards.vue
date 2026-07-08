<script setup lang="ts">
// Membres d'UNE équipe — extrait de GroupsView pour être partagé avec MyGroupView
// (« gérer mon équipe »). « Derive don't duplicate » : une seule implémentation des
// gestes membre, deux points de montage (org_admin sur une équipe sélectionnée · chef
// sur son équipe active). Les CLÉS partagées de l'équipe vivent dans GroupConnectorsCard
// (cockpit connecteurs, même dialecte que /org/connectors). Le parent recharge le détail
// sur `@changed` (mutations keyées par `groupId`).
//
// MEMBRES — on n'ajoute plus par saisie libre d'email : la personne doit déjà être dans
// l'org, donc on PICKE parmi les membres de l'org pas encore dans l'équipe.
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import FormDialog from './FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import {
  addGroupMember, setGroupMemberRole, removeGroupMember, getOrg,
} from '@/api/console'
import type { GroupMember, GroupRole } from '@/types/api'
import { humanize } from '@/lib/errors'

const props = defineProps<{
  groupId: number
  orgId: number
  members: GroupMember[]
  canManage: boolean
  meSub: string | null
}>()
const emit = defineEmits<{ changed: [] }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

// ── membres ────────────────────────────────────────────────────────────────
async function addMember() {
  // Candidats = membres de l'org pas encore dans l'équipe (on ne saisit plus d'email).
  let candidates: { value: string; label: string }[] = []
  try {
    const org = await getOrg(props.orgId)
    const inTeam = new Set(props.members.map((m) => m.sub))
    candidates = org.members
      .filter((m) => !inTeam.has(m.sub))
      .map((m) => ({ value: m.sub, label: m.name ? `${m.name} · ${m.email ?? ''}`.trim() : (m.email ?? m.sub) }))
  } catch (e) { toast(humanize(e)); return }
  if (!candidates.length) { toast('everyone in the org is already in this team.'); return }
  openForm({
    title: 'add to team',
    description: 'pick an org member to add. invite new people to the org from « organization ».',
    fields: [
      { key: 'target', label: 'member', type: 'select', required: true, options: candidates },
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
  if (!await confirmAction({ title: 'remove member', danger: true, confirmLabel: 'Remove', message: 'remove this member from the team? they stay in the org.' })) return
  try { await removeGroupMember(props.groupId, sub); toast('member removed'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConsoleCard title="members" flush sub="who belongs to this team.">
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

  <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
    :title="formDialog.title" :description="formDialog.description"
    :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
</template>
