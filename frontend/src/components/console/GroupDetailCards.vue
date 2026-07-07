<script setup lang="ts">
// Cartes de gestion d'UNE équipe (membres + clés partagées par connecteur) — extrait
// de GroupsView pour être partagé avec MyGroupView (« gérer mon équipe »). « Derive
// don't duplicate » : une seule implémentation des gestes membre/clé, deux points de
// montage (org_admin sur une équipe sélectionnée · chef sur son équipe active). Le
// parent recharge le détail sur `@changed` (mutations keyées par `groupId`).
//
// Deux reprises d'UX (2026-07-06) :
//  · MEMBRES — on n'ajoute plus par saisie libre d'email : la personne doit déjà être
//    dans l'org, donc on PICKE parmi les membres de l'org pas encore dans l'équipe.
//  · CLÉS — « secrets = connecteurs » : au lieu d'un provider en texte libre + api_key,
//    on picke un connecteur du catalogue et on saisit le credential via la MÊME
//    machinerie que l'org (`CredentialFieldsDialog`, mono- ou multi-champs zoho/silae).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import FormDialog from './FormDialog.vue'
import CredentialFieldsDialog from './CredentialFieldsDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import {
  addGroupMember, setGroupMemberRole, removeGroupMember,
  setGroupSecret, deleteGroupSecret, getConnectors, getOrg,
} from '@/api/console'
import type { GroupMember, GroupSecret, GroupRole, ConnectorMeta, CredentialField } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const props = defineProps<{
  groupId: number
  orgId: number
  members: GroupMember[]
  secrets: GroupSecret[]
  canManage: boolean
  meSub: string | null
}>()
const emit = defineEmits<{ changed: [] }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

// Catalogue connecteurs (label/logo + secret_kind) — chargé une fois pour habiller
// les clés posées ET alimenter le picker « ajouter une clé ».
const meta = ref<Record<string, ConnectorMeta>>({})
// Seuls les connecteurs à clé partageable peuvent porter une clé d'équipe : clé simple
// (`api_key`) ou multi-champs (`fields` : zoho/silae/bridges) — même set qu'au niveau org.
const SHAREABLE = new Set(['api_key', 'fields'])
onMounted(async () => {
  try {
    const cat = await getConnectors()
    meta.value = Object.fromEntries(cat.connectors.map((c) => [c.name, c]))
  } catch { /* catalogue indisponible : on retombe sur les noms bruts */ }
})
const metaOf = (provider: string) => meta.value[provider] ?? null
const labelOf = (provider: string) => metaOf(provider)?.label ?? provider

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

// ── clés partagées (par connecteur) ──────────────────────────────────────────
// Credential courant à saisir : rendu par CredentialFieldsDialog. `multi` = connecteur
// multi-champs (`secret_kind='fields'` → `fields` peuplé) vs clé simple (`api_key`),
// même décision qu'au niveau org.
const credConn = ref<{ label: string; provider: string; fields: CredentialField[]; multi: boolean } | null>(null)
const credOpen = ref(false)

// « Ajouter une clé » : on picke un connecteur partageable pas encore keyé, puis on
// saisit le credential. Deux dialogs distincts (picker FormDialog → cred dialog).
function addSecret() {
  const keyed = new Set(props.secrets.map((s) => s.provider))
  const candidates = Object.values(meta.value)
    .filter((m) => SHAREABLE.has(m.secret_kind) && !keyed.has(m.name))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((m) => ({ value: m.name, label: m.label }))
  if (!candidates.length) { toast('all shareable connectors already have a team key.'); return }
  openForm({
    title: 'shared connector key',
    description: 'the team\'s account key for a connector — resolves before the org key for its members.',
    fields: [{ key: 'provider', label: 'connector', type: 'select', required: true, options: candidates }],
    submitLabel: 'next',
    onConfirm: async (v) => { openCred(v.provider ?? '') },
  })
}
function openCred(provider: string) {
  const m = metaOf(provider)
  const label = m?.label ?? provider
  const multi = m?.secret_kind === 'fields' && (m.credential_fields?.length ?? 0) > 0
  const fields: CredentialField[] = multi
    ? m!.credential_fields
    : [{ name: 'api_key', label: `clé api ${label}`, secret: true, required: true }]
  credConn.value = { label, provider, fields, multi }
  credOpen.value = true
}
async function saveCred(values: Record<string, string>) {
  const c = credConn.value
  if (!c) return
  try {
    await setGroupSecret(props.groupId, c.provider, c.multi ? '' : (values.api_key ?? ''), undefined, c.multi ? values : undefined)
    toast(`${c.label}: team key saved`)
    emit('changed')
  } catch (e) { toast(humanize(e)); throw e }
}
async function removeSecret(provider: string) {
  if (!await confirmAction({ title: 'remove shared key', danger: true, confirmLabel: 'Remove', message: `remove the shared ${labelOf(provider)} key?` })) return
  try { await deleteGroupSecret(props.groupId, provider); toast('shared key removed'); emit('changed') }
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

  <ConsoleCard title="shared connector keys" flush
    sub="team-level connector credentials — resolve before the org key for this team's members (cascade: personal › team › org › platform).">
    <template v-if="canManage" #actions>
      <Btn kind="mini" icon="plus" @click="addSecret">Add key</Btn>
    </template>
    <table class="tbl">
      <thead><tr><th>connector</th><th>type</th><th>set by</th><th>since</th><th v-if="canManage" style="width: 130px"></th></tr></thead>
      <tbody>
        <tr v-for="s in secrets" :key="s.provider">
          <td>
            <div style="display: flex; align-items: center; gap: 8px">
              <img v-if="metaOf(s.provider)?.logo_url" :src="metaOf(s.provider)!.logo_url!" alt="" width="18" height="18" style="border-radius: 4px" />
              <span style="font-weight: 600; color: var(--color-ink)">{{ labelOf(s.provider) }}</span>
            </div>
          </td>
          <td><Tag v-if="s.base_url" tone="cobalt">remote bridge</Tag><Tag v-else>api key</Tag></td>
          <td class="dim">{{ s.set_by ?? '—' }}</td>
          <td class="dim">{{ fmtDate(s.set_at) ?? '—' }}</td>
          <td v-if="canManage" style="text-align: right; white-space: nowrap">
            <Btn kind="mini" @click="openCred(s.provider)">Rotate</Btn>
            <Btn kind="danger" @click="removeSecret(s.provider)">Remove</Btn>
          </td>
        </tr>
        <tr v-if="!secrets.length"><td :colspan="canManage ? 5 : 4" class="dim" style="text-align: center; padding: 14px">no shared keys</td></tr>
      </tbody>
    </table>
  </ConsoleCard>

  <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
    :title="formDialog.title" :description="formDialog.description"
    :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />

  <CredentialFieldsDialog v-if="credConn" v-model:open="credOpen"
    :label="credConn.label" :fields="credConn.fields" :single="!credConn.multi"
    :on-confirm="saveCred" />
</template>
