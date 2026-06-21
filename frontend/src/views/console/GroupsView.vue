<script setup lang="ts">
// Groupes (départements) d'une org + chef d'équipe (ADR 0012).
// Liste des groupes de l'org active, switch de groupe actif, et — pour le chef
// (group_admin) ou un org_admin — gestion des membres, secrets partagés, preset
// de toolset, doctrine. Le backend porte l'autz (escalade roles.py) ; l'UI ne
// fait que masquer les contrôles.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import GroupDoctrineCard from '@/components/console/GroupDoctrineCard.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useDeepLink } from '@/composables/useDeepLink'
import { useMe } from '@/composables/useMe'
import {
  listGroups, getGroup, createGroup, updateGroup, deleteGroup, useGroup, clearActiveGroup,
  addGroupMember, setGroupMemberRole, removeGroupMember,
  setGroupSecret, deleteGroupSecret, setGroupPreset,
} from '@/api/console'
import type { GroupDetail, GroupListItem, GroupRole } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction, promptForm } = usePrompt()
const { me, reload } = useMe()

const groups = ref<GroupListItem[]>([])
const detail = ref<GroupDetail | null>(null)
const selectedId = ref<number | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)

// Département ouvert porté par `?dept=<id>` (lien direct + retour).
const dl = useDeepLink('dept', (id) => {
  if (id != null && id !== selectedId.value) select(id)
  else if (id == null && selectedId.value != null) { selectedId.value = null; detail.value = null }
}, { parse: Number })

const activeOrgId = computed(() => me.value?.active_org ?? null)
const activeGroupId = computed(() => me.value?.active_group ?? null)
const meSub = computed(() => me.value?.sub ?? null)
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin' || me.value?.role === 'admin')
// Chef du groupe ouvert (escalade org_admin/platform incluse côté UI).
const canManage = computed(() =>
  !!detail.value && (detail.value.group.my_role === 'group_admin' || isOrgAdmin.value))

async function load() {
  if (activeOrgId.value == null) { loaded.value = true; return }
  try {
    groups.value = (await listGroups(activeOrgId.value)).groups
    if (selectedId.value != null) await select(selectedId.value)
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(() => {
  const id = dl.read()
  if (id != null) selectedId.value = id
  return load()
})

async function select(id: number) {
  selectedId.value = id
  dl.set(id)
  try { detail.value = await getGroup(id) }
  catch (e) { toast(humanize(e)); detail.value = null }
}
async function refresh() {
  await load()
  if (selectedId.value != null) await select(selectedId.value)
}

async function create() {
  const r = await promptForm({
    title: 'new department',
    description: 'a group inside your org, with its own team lead, doctrine, toolset and shared keys.',
    fields: [
      { key: 'name', label: 'name', placeholder: 'sales, ops, finance…', required: true },
      { key: 'description', label: 'description', type: 'textarea', placeholder: 'what this team does (optional)' },
    ],
    submitLabel: 'create',
  })
  if (!r || !r.name) return
  try {
    const g = await createGroup(activeOrgId.value!, r.name, r.description || '')
    toast(`department "${g.name}" created`)
    await load(); await select(g.group_id)
  } catch (e) { toast(humanize(e)) }
}

async function switchTo(id: number) {
  try { await useGroup(id); await reload(); await refresh(); toast('active department switched') }
  catch (e) { toast(humanize(e)) }
}
async function leaveActive() {
  try { await clearActiveGroup(); await reload(); await load(); toast('back to org level') }
  catch (e) { toast(humanize(e)) }
}

async function addMember() {
  const r = await promptForm({
    title: 'add to department',
    description: 'the person must already be a member of the org.',
    fields: [
      { key: 'target', label: 'email or sub', placeholder: 'name@company.com', required: true },
      { key: 'role', label: 'role', type: 'select', value: 'group_member',
        options: [{ value: 'group_member', label: 'member' }, { value: 'group_admin', label: 'team lead' }] },
    ],
    submitLabel: 'add',
  })
  if (!r || !r.target) return
  const role: GroupRole = r.role === 'group_admin' ? 'group_admin' : 'group_member'
  try { await addGroupMember(selectedId.value!, r.target, role); toast('member added'); await select(selectedId.value!) }
  catch (e) { toast(humanize(e)) }
}
async function toggleMemberRole(sub: string, role: GroupRole) {
  const next: GroupRole = role === 'group_admin' ? 'group_member' : 'group_admin'
  try { await setGroupMemberRole(selectedId.value!, sub, next); toast('role updated'); await select(selectedId.value!) }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(sub: string) {
  if (!await confirmAction({ title: 'remove member', danger: true, confirmLabel: 'remove', message: 'remove this member from the department?' })) return
  try { await removeGroupMember(selectedId.value!, sub); toast('member removed'); await select(selectedId.value!) }
  catch (e) { toast(humanize(e)) }
}

async function addSecret() {
  const r = await promptForm({
    title: 'shared key',
    description: 'an org-shareable provider key for this department — resolves before the org key for its members.',
    fields: [
      { key: 'provider', label: 'provider', placeholder: 'attio, pennylane…', required: true },
      { key: 'api_key', label: 'api key', type: 'password', required: true },
      { key: 'base_url', label: 'base url', placeholder: 'remote connectors only (optional)' },
    ],
    submitLabel: 'save key',
  })
  if (!r || !r.provider || !r.api_key) return
  try { await setGroupSecret(selectedId.value!, r.provider, r.api_key, r.base_url || undefined); toast('shared key saved'); await select(selectedId.value!) }
  catch (e) { toast(humanize(e)) }
}
async function removeSecret(provider: string) {
  if (!await confirmAction({ title: 'remove shared key', danger: true, confirmLabel: 'remove', message: `remove the shared ${provider} key?` })) return
  try { await deleteGroupSecret(selectedId.value!, provider); toast('shared key removed'); await select(selectedId.value!) }
  catch (e) { toast(humanize(e)) }
}

async function editPreset() {
  const current = (detail.value?.default_tools ?? []).join('\n')
  const r = await promptForm({
    title: 'toolset preset',
    description: 'one tool name per line — the default visible toolset for this team. personal toggles still win; grant-only tools are never revealed. leave empty to keep nobody visible by default.',
    fields: [{ key: 'tools', label: 'tools', type: 'textarea', value: current, placeholder: 'serper_web_search\nfr_search\n…' }],
    submitLabel: 'set preset',
  })
  if (!r) return
  const tools = (r.tools || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
  try { await setGroupPreset(selectedId.value!, tools); toast('preset set'); await select(selectedId.value!) }
  catch (e) { toast(humanize(e)) }
}
async function clearPreset() {
  if (!await confirmAction({ title: 'clear preset', confirmLabel: 'clear', message: 'remove the toolset baseline (members keep their default visibility)?' })) return
  try { await setGroupPreset(selectedId.value!, null); toast('preset cleared'); await select(selectedId.value!) }
  catch (e) { toast(humanize(e)) }
}

async function rename() {
  const r = await promptForm({
    title: 'edit department',
    fields: [
      { key: 'name', label: 'name', value: detail.value?.group.name, required: true },
      { key: 'description', label: 'description', type: 'textarea', value: detail.value?.group.description },
    ],
    submitLabel: 'save',
  })
  if (!r || !r.name) return
  try { await updateGroup(selectedId.value!, { name: r.name, description: r.description || '' }); toast('saved'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function removeGroup() {
  if (!await confirmAction({ title: 'delete department', danger: true, confirmLabel: 'delete', message: 'delete this department? members, doctrine, preset and shared keys are purged. members stay in the org.' })) return
  try { await deleteGroup(selectedId.value!); toast('department deleted'); detail.value = null; selectedId.value = null; dl.set(null); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="no active org">
      <div class="helptext">join or create an organization first — departments live inside an org.</div>
    </ConsoleCard>

    <template v-else>
      <div class="grid23">
        <ConsoleCard title="departments" flush
          sub="teams inside your org. switch the active one to load its doctrine, toolset and shared keys.">
          <template #actions>
            <Btn v-if="isOrgAdmin" kind="mini" icon="plus" @click="create">new</Btn>
          </template>
          <table class="tbl">
            <thead><tr><th>department</th><th>you</th><th>active</th><th style="width: 150px"></th></tr></thead>
            <tbody>
              <tr v-for="g in groups" :key="g.id" :style="g.id === selectedId ? 'background: var(--color-wash)' : ''">
                <td>
                  <div style="font-weight: 600; color: var(--color-ink); cursor: pointer" @click="select(g.id)">{{ g.name }}</div>
                  <div style="font-size: 11px; color: var(--color-faint)">{{ g.member_count }} members<span v-if="g.description"> · {{ g.description }}</span></div>
                </td>
                <td>
                  <Tag v-if="g.my_role === 'group_admin'" tone="ink">lead</Tag>
                  <Tag v-else-if="g.my_role === 'group_member'">member</Tag>
                  <span v-else class="dim" style="font-size: 11px">—</span>
                </td>
                <td><Dot :tone="g.id === activeGroupId ? 'saffron' : 'faint'" :size="7" /></td>
                <td style="text-align: right; white-space: nowrap">
                  <Btn kind="mini" @click="select(g.id)">open</Btn>
                  <Btn v-if="g.my_role && g.id !== activeGroupId" kind="mini" @click="switchTo(g.id)">use</Btn>
                </td>
              </tr>
              <tr v-if="!groups.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no departments yet<span v-if="isOrgAdmin"> — create one</span>.</td></tr>
            </tbody>
          </table>
          <div v-if="activeGroupId != null" style="padding: 10px 14px; border-top: 1px solid var(--color-hair)">
            <Btn kind="mini" @click="leaveActive">leave active department (operate at org level)</Btn>
          </div>
        </ConsoleCard>

        <ConsoleCard v-if="detail" :title="detail.group.name" flush :sub="detail.group.description || 'department'">
          <template #actions>
            <Btn v-if="canManage" kind="mini" @click="rename">edit</Btn>
            <Btn v-if="canManage" kind="danger" @click="removeGroup">delete</Btn>
          </template>
          <table class="tbl">
            <thead><tr><th>member</th><th>role</th><th v-if="canManage" style="width: 130px"></th></tr></thead>
            <tbody>
              <tr v-for="m in detail.members" :key="m.sub">
                <td>
                  <div style="font-weight: 600; color: var(--color-ink)">{{ m.name || m.email }}</div>
                  <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
                </td>
                <td><Tag v-if="m.role === 'group_admin'" tone="ink">lead</Tag><Tag v-else>member</Tag></td>
                <td v-if="canManage" style="text-align: right; white-space: nowrap">
                  <template v-if="m.sub !== meSub">
                    <Btn kind="mini" @click="toggleMemberRole(m.sub, m.role)">{{ m.role === 'group_admin' ? 'demote' : 'make lead' }}</Btn>
                    <Btn kind="danger" @click="removeMember(m.sub)">remove</Btn>
                  </template>
                  <span v-else class="dim" style="font-size: 11px">you</span>
                </td>
              </tr>
              <tr v-if="!detail.members.length"><td :colspan="canManage ? 3 : 2" class="dim" style="text-align: center; padding: 14px">no members</td></tr>
            </tbody>
          </table>
          <div v-if="canManage" style="padding: 10px 14px; border-top: 1px solid var(--color-hair)">
            <Btn kind="mini" icon="plus" @click="addMember">add member</Btn>
          </div>
        </ConsoleCard>
        <ConsoleCard v-else title="department" sub="pick a department on the left to manage it.">
          <div class="helptext">select a department to see its members, shared keys, toolset preset and doctrine.</div>
        </ConsoleCard>
      </div>

      <template v-if="detail">
        <div class="grid23">
          <ConsoleCard title="shared keys" flush
            sub="department-level credentials — resolve before the org key for this team's members.">
            <template #actions>
              <Btn v-if="canManage" kind="mini" icon="plus" @click="addSecret">add key</Btn>
            </template>
            <table class="tbl">
              <thead><tr><th>provider</th><th>type</th><th>set by</th><th>since</th><th v-if="canManage" style="width: 80px"></th></tr></thead>
              <tbody>
                <tr v-for="s in detail.secrets" :key="s.provider">
                  <td style="font-weight: 600; color: var(--color-ink)">{{ s.provider }}</td>
                  <td><Tag v-if="s.base_url" tone="cobalt">remote bridge</Tag><Tag v-else>api key</Tag></td>
                  <td class="dim">{{ s.set_by ?? '—' }}</td>
                  <td class="dim">{{ fmtDate(s.set_at) ?? '—' }}</td>
                  <td v-if="canManage" style="text-align: right"><Btn kind="danger" @click="removeSecret(s.provider)">remove</Btn></td>
                </tr>
                <tr v-if="!detail.secrets.length"><td :colspan="canManage ? 5 : 4" class="dim" style="text-align: center; padding: 14px">no shared keys</td></tr>
              </tbody>
            </table>
          </ConsoleCard>

          <ConsoleCard title="toolset preset"
            sub="the default visible toolset for this team. personal toggles still win; grant-only tools stay entitlement-gated.">
            <template #actions v-if="canManage">
              <Btn kind="mini" @click="editPreset">edit</Btn>
              <Btn v-if="detail.default_tools" kind="mini" @click="clearPreset">clear</Btn>
            </template>
            <div v-if="detail.default_tools == null" class="helptext">no baseline — members keep their default toolset visibility.</div>
            <div v-else-if="!detail.default_tools.length" class="helptext">empty baseline — nothing visible by default for this team.</div>
            <div v-else class="rowlist">
              <div v-for="t in detail.default_tools" :key="t" class="rowitem"><Tag>{{ t }}</Tag></div>
            </div>
          </ConsoleCard>
        </div>

        <GroupDoctrineCard :group-id="detail.group.id" :can-edit="canManage" />
      </template>
    </template>
  </div>
</template>
