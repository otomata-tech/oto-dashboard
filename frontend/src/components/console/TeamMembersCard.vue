<script setup lang="ts">
// Membres d'UNE équipe (org_admin sur /org/teams/:id, ADR 0012) — réintroduit après
// oto#192 : le retrait du 12/09/2026 avait pris tout le scope d'équipe dédié (contexte,
// connecteurs, procédures, invitations comprises), sur une mesure « zéro usage externe
// en 45 jours ». Besoin réel apparu le 18/09/2026 : un membre d'équipe (pas org_admin)
// ne pouvait plus gérer les membres/secrets de sa propre équipe. Périmètre resserré,
// décidé par Alexis : SEULS les membres reviennent ici (pas le contexte, pas les
// connecteurs, pas les procédures). Connecteurs revenus le 18/09, invitation d'équipe le
// 23/09 (le dashboard reste le front du produit) : `InvitationsCard`, niveau `team`.
//
// MEMBRES — on n'ajoute pas par saisie libre d'email : la personne doit déjà être dans
// l'org, donc on PICKE parmi les membres de l'org pas encore dans l'équipe.
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import FormDialog from './FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { addGroupMember, setGroupMemberRole, removeGroupMember, getOrg } from '@/api/console'
import type { GroupMember, GroupRole } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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

async function addMember() {
  // Candidats = membres de l'org pas encore dans l'équipe (pas de saisie libre d'email).
  let candidates: { value: string; label: string }[] = []
  try {
    const org = await getOrg(props.orgId)
    const inTeam = new Set(props.members.map((m) => m.sub))
    candidates = org.members
      .filter((m) => !inTeam.has(m.sub))
      .map((m) => ({ value: m.sub, label: m.name ? `${m.name} · ${m.email ?? ''}`.trim() : (m.email ?? m.sub) }))
  } catch (e) { toast(humanize(e)); return }
  if (!candidates.length) { toast(t('orgUi.teamMembers.allIn')); return }
  openForm({
    title: t('orgUi.teamMembers.addTitle'),
    description: t('orgUi.teamMembers.addDesc'),
    fields: [
      { key: 'target', label: t('orgUi.teamMembers.member'), type: 'select', required: true, options: candidates },
      { key: 'role', label: t('orgUi.teamMembers.role'), type: 'select', initial: 'group_member',
        options: [{ value: 'group_member', label: t('orgUi.teamMembers.member') }, { value: 'group_admin', label: t('orgUi.teamMembers.teamLead') }] },
    ],
    submitLabel: t('orgUi.teamMembers.add'),
    onConfirm: async (v) => {
      const role: GroupRole = v.role === 'group_admin' ? 'group_admin' : 'group_member'
      try { await addGroupMember(props.groupId, (v.target ?? ''), role); toast(t('orgUi.teamMembers.added')); emit('changed') }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function toggleMemberRole(sub: string, role: GroupRole) {
  const next: GroupRole = role === 'group_admin' ? 'group_member' : 'group_admin'
  try { await setGroupMemberRole(props.groupId, sub, next); toast(t('orgUi.teamMembers.roleUpdated')); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(sub: string) {
  if (!await confirmAction({ title: t('orgUi.teamMembers.removeTitle'), danger: true, confirmLabel: t('orgUi.teamMembers.remove'), message: t('orgUi.teamMembers.removeMessage') })) return
  try { await removeGroupMember(props.groupId, sub); toast(t('orgUi.teamMembers.removed')); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConsoleCard :title="t('orgUi.teamMembers.title')" flush :sub="t('orgUi.teamMembers.sub')">
    <template v-if="canManage" #actions>
      <Btn kind="mini" icon="plus" @click="addMember">{{ t('orgUi.teamMembers.addMember') }}</Btn>
    </template>
    <table class="tbl">
      <thead><tr><th>{{ t('orgUi.teamMembers.member') }}</th><th>{{ t('orgUi.teamMembers.role') }}</th><th v-if="canManage" style="width: 130px"></th></tr></thead>
      <tbody>
        <tr v-for="m in members" :key="m.sub">
          <td>
            <div style="font-weight: 600; color: var(--color-ink)">{{ m.name || m.email }}</div>
            <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
          </td>
          <td><Tag v-if="m.role === 'group_admin'" tone="ink">{{ t('orgUi.teamMembers.lead') }}</Tag><Tag v-else>{{ t('orgUi.teamMembers.member') }}</Tag></td>
          <td v-if="canManage" style="text-align: right; white-space: nowrap">
            <template v-if="m.sub !== meSub">
              <Btn kind="mini" @click="toggleMemberRole(m.sub, m.role)">{{ m.role === 'group_admin' ? t('orgUi.teamMembers.demote') : t('orgUi.teamMembers.makeLead') }}</Btn>
              <Btn kind="danger" @click="removeMember(m.sub)">{{ t('orgUi.teamMembers.remove') }}</Btn>
            </template>
            <span v-else class="dim" style="font-size: 11px">{{ t('orgUi.teamMembers.you') }}</span>
          </td>
        </tr>
        <tr v-if="!members.length"><td :colspan="canManage ? 3 : 2" class="dim" style="text-align: center; padding: 14px">{{ t('orgUi.teamMembers.none') }}</td></tr>
      </tbody>
    </table>
  </ConsoleCard>

  <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
    :title="formDialog.title" :description="formDialog.description"
    :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
</template>
