<script setup lang="ts">
// Équipes (« teams ») d'une org — surface ORG (org_admin) : lister toutes les équipes,
// en créer, switcher l'équipe active, gérer une équipe sélectionnée (ADR 0012 ; le
// vocabulaire produit « département/groupe » est passé à « team » le 2026-07-06, les
// identifiants de code restent `group`/`getGroup`). La gestion d'UNE équipe (membres +
// clés) est le composant partagé GroupDetailCards, réutilisé par MyGroupView (« gérer
// mon équipe », côté chef). Le backend porte l'autz (escalade roles.py) ; l'UI masque.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import GroupDetailCards from '@/components/console/GroupDetailCards.vue'
import GroupDoctrineCard from '@/components/console/GroupDoctrineCard.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useDeepLink } from '@/composables/useDeepLink'
import { useMe } from '@/composables/useMe'
import {
  listGroups, getGroup, createGroup, updateGroup, deleteGroup, useGroup, clearActiveGroup,
} from '@/api/console'
import type { GroupDetail, GroupListItem } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const { me, reload } = useMe()

const groups = ref<GroupListItem[]>([])
const detail = ref<GroupDetail | null>(null)
const selectedId = ref<number | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)

// Équipe ouverte portée par `?team=<id>` (lien direct + retour ; ex-`?dept=`).
const dl = useDeepLink('team', (id) => {
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

function create() {
  openForm({
    title: 'new team',
    description: 'a team inside your org, with its own team lead, agent readme, procedures, toolset and shared keys.',
    fields: [
      { key: 'name', label: 'name', placeholder: 'sales, ops, finance…', required: true },
      { key: 'description', label: 'description', type: 'textarea', placeholder: 'what this team does (optional)' },
    ],
    submitLabel: 'create',
    onConfirm: async (v) => {
      try {
        const g = await createGroup(activeOrgId.value!, (v.name ?? ''), v.description || '')
        toast(`team "${g.name}" created`)
        await load(); await select(g.group_id)
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}

async function switchTo(id: number) {
  try { await useGroup(id); await reload(); await refresh(); toast('active team switched') }
  catch (e) { toast(humanize(e)) }
}
async function leaveActive() {
  try { await clearActiveGroup(); await reload(); await load(); toast('back to org level') }
  catch (e) { toast(humanize(e)) }
}

function rename() {
  openForm({
    title: 'edit team',
    fields: [
      { key: 'name', label: 'name', initial: detail.value?.group.name, required: true },
      { key: 'description', label: 'description', type: 'textarea', initial: detail.value?.group.description },
    ],
    submitLabel: 'save',
    onConfirm: async (v) => {
      try { await updateGroup(selectedId.value!, { name: (v.name ?? ''), description: v.description || '' }); toast('saved'); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function removeGroup() {
  if (!await confirmAction({ title: 'delete team', danger: true, confirmLabel: 'Delete', message: 'delete this team? members, readme, procedures and shared keys are purged. members stay in the org.' })) return
  try { await deleteGroup(selectedId.value!); toast('team deleted'); detail.value = null; selectedId.value = null; dl.set(null); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="no active org">
      <div class="helptext">join or create an organization first — teams live inside an org.</div>
    </ConsoleCard>

    <template v-else>
      <div class="grid23">
        <ConsoleCard title="teams" flush
          sub="teams inside your org. switch the active one to load its readme, procedures, toolset and shared keys.">
          <template #actions>
            <Btn v-if="isOrgAdmin" kind="mini" icon="plus" @click="create">New</Btn>
          </template>
          <table class="tbl">
            <thead><tr><th>team</th><th>you</th><th>active</th><th style="width: 150px"></th></tr></thead>
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
                  <Btn kind="mini" @click="select(g.id)">Open</Btn>
                  <Btn v-if="g.my_role && g.id !== activeGroupId" kind="mini" @click="switchTo(g.id)">Use</Btn>
                </td>
              </tr>
              <tr v-if="!groups.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no teams yet<span v-if="isOrgAdmin"> — create one</span>.</td></tr>
            </tbody>
          </table>
          <div v-if="activeGroupId != null" style="padding: 10px 14px; border-top: 1px solid var(--color-hair)">
            <Btn kind="mini" @click="leaveActive">Leave active team (operate at org level)</Btn>
          </div>
        </ConsoleCard>

        <ConsoleCard v-if="detail" :title="detail.group.name" flush :sub="detail.group.description || 'team'">
          <template #actions>
            <Btn v-if="canManage" kind="mini" @click="rename">Edit</Btn>
            <Btn v-if="canManage" kind="danger" @click="removeGroup">Delete</Btn>
          </template>
          <div class="helptext" style="padding: 12px 14px">members, shared keys, readme and procedures below.</div>
        </ConsoleCard>
        <ConsoleCard v-else title="team" sub="pick a team on the left to manage it.">
          <div class="helptext">select a team to see its members, shared keys, readme and procedures.</div>
        </ConsoleCard>
      </div>

      <template v-if="detail">
        <div class="grid23">
          <GroupDetailCards :group-id="detail.group.id" :org-id="detail.group.org_id" :members="detail.members" :secrets="detail.secrets"
            :can-manage="canManage" :me-sub="meSub" @changed="select(detail.group.id)" />
        </div>

        <GroupDoctrineCard :group-id="detail.group.id" :can-edit="canManage" />
      </template>
    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>
