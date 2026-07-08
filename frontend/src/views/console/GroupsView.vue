<script setup lang="ts">
// Équipes (« teams ») d'une org — surface ORG (org_admin) : le ROSTER des équipes.
// Lister, créer, renommer, supprimer. La GESTION d'UNE équipe (contexte, membres,
// connecteurs, procédures) n'est plus empilée ici : ouvrir une équipe = DESCENDRE dans
// son scope dédié (/o:org/g:team/team/*, menu Team parallèle à Org/Plateforme). Le
// vocabulaire produit « département/groupe » est passé à « team » le 2026-07-06 ; les
// identifiants de code restent `group`/`getGroup`. Le backend porte l'autz (roles.py) ;
// l'UI masque les gestes org-admin.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useMe } from '@/composables/useMe'
import { listGroups, createGroup, updateGroup, deleteGroup } from '@/api/console'
import type { GroupListItem } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const { me } = useMe()

const groups = ref<GroupListItem[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

const activeOrgId = computed(() => me.value?.active_org ?? null)
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin' || me.value?.role === 'admin')

async function load() {
  if (activeOrgId.value == null) { loaded.value = true; return }
  try { groups.value = (await listGroups(activeOrgId.value)).groups }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

// Ouvrir une équipe = DESCENDRE dans son scope (menu Team). Nav DURE : `me` est re-fetché
// avec le header X-Oto-Group, la sidebar bascule sur le menu Team, l'identité montre
// Org ▸ Team. Un router.push SPA laisserait `me`/la sidebar sur le niveau org.
function open(id: number) {
  if (activeOrgId.value == null) return
  window.location.assign(`/o/${activeOrgId.value}/g/${id}/team/context`)
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
        open(g.group_id)   // descend directement dans la nouvelle équipe
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}

function rename(g: GroupListItem) {
  openForm({
    title: 'edit team',
    fields: [
      { key: 'name', label: 'name', initial: g.name, required: true },
      { key: 'description', label: 'description', type: 'textarea', initial: g.description },
    ],
    submitLabel: 'save',
    onConfirm: async (v) => {
      try { await updateGroup(g.id, { name: (v.name ?? ''), description: v.description || '' }); toast('saved'); await load() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function removeGroup(g: GroupListItem) {
  if (!await confirmAction({ title: 'delete team', danger: true, confirmLabel: 'Delete', message: 'delete this team? members, readme, procedures and shared keys are purged. members stay in the org.' })) return
  try { await deleteGroup(g.id); toast('team deleted'); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="no active org">
      <div class="helptext">join or create an organization first — teams live inside an org.</div>
    </ConsoleCard>

    <ConsoleCard v-else title="teams" flush
      sub="teams inside your org. open one to enter its dedicated scope — context, members, connectors and procedures.">
      <template #actions>
        <Btn v-if="isOrgAdmin" kind="mini" icon="plus" @click="create">New</Btn>
      </template>
      <table class="tbl">
        <thead><tr><th>team</th><th>you</th><th style="width: 190px"></th></tr></thead>
        <tbody>
          <tr v-for="g in groups" :key="g.id">
            <td>
              <div style="font-weight: 600; color: var(--color-ink); cursor: pointer" @click="open(g.id)">{{ g.name }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">{{ g.member_count }} members<span v-if="g.description"> · {{ g.description }}</span></div>
            </td>
            <td>
              <Tag v-if="g.my_role === 'group_admin'" tone="ink">lead</Tag>
              <Tag v-else-if="g.my_role === 'group_member'">member</Tag>
              <span v-else class="dim" style="font-size: 11px">—</span>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <Btn kind="mini" @click="open(g.id)">Open</Btn>
              <template v-if="isOrgAdmin">
                <Btn kind="mini" @click="rename(g)">Edit</Btn>
                <Btn kind="danger" @click="removeGroup(g)">Delete</Btn>
              </template>
            </td>
          </tr>
          <tr v-if="!groups.length"><td colspan="3" class="dim" style="text-align: center; padding: 16px">no teams yet<span v-if="isOrgAdmin"> — create one</span>.</td></tr>
        </tbody>
      </table>
    </ConsoleCard>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>
