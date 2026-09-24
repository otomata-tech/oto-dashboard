<script setup lang="ts">
// Équipes (« teams ») d'une org — surface ORG (org_admin) : le ROSTER des équipes.
// Lister, créer, renommer, supprimer, et depuis chaque ligne, gérer ses MEMBRES
// (`/org/teams/:id`, TeamDetailView). Le reste de la gestion d'une équipe (contexte,
// connecteurs, procédures) a quitté le dashboard avec son scope dédié (oto#192) ; seuls
// les membres sont revenus (besoin réel, 18/09/2026) — cf. docs/orgs-groupes-invitations.md.
// Le vocabulaire produit « département/groupe » est passé à « team » le 2026-07-06 ; les
// identifiants de code restent `group`/`getGroup`. Le backend porte l'autz (roles.py) ;
// l'UI masque les gestes org-admin.
// 18/09/2026 : lien « connectors » restauré vers /org/teams/:groupId/connectors (seul
// le panneau clé/disponibilité/accès d'équipe est revenu, pas le reste du niveau
// équipe) — visible pour l'org_admin OU le chef de CETTE équipe (`my_role`).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useMe, canAdministerOrg } from '@/composables/useMe'
import { listGroups, createGroup, updateGroup, deleteGroup } from '@/api/console'
import type { GroupListItem } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const router = useRouter()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const { me } = useMe()

const groups = ref<GroupListItem[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

const activeOrgId = computed(() => me.value?.active_org ?? null)
// Les gestes du roster, tels que le serveur les accepte (`canAdministerOrg`) : l'admin
// plateforme LIT la liste, il ne crée, ne renomme ni ne supprime (oto#210) ; en consultation,
// personne (oto#211).
const orgAdmin = computed(() => canAdministerOrg(me.value))

// Visible pour l'org_admin (toutes les équipes) OU le chef de CETTE équipe précise —
// même garde que le serveur (`GROUP_ADMIN_OF` = chef d'équipe OU org_admin parent).
function canManageConnectors(g: GroupListItem): boolean {
  return orgAdmin.value || g.my_role === 'group_admin'
}
function connectorsLink(g: GroupListItem): string {
  return activeOrgId.value == null
    ? `/org/teams/${g.id}/connectors`
    : `/o/${activeOrgId.value}/org/teams/${g.id}/connectors`
}
// Navigation DURE (pas router.push) : on quitte le niveau org pour le niveau équipe,
// même patron que goUpToOrg/goUpToPlatform de ConsoleIdentity — un push SPA laisserait
// `me`/la sidebar périmés (le niveau équipe n'a pas de state à recomposer proprement ici).
function openConnectors(g: GroupListItem) { window.location.assign(connectorsLink(g)) }

async function load() {
  if (activeOrgId.value == null) { loaded.value = true; return }
  try { groups.value = (await listGroups(activeOrgId.value)).groups }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

function create() {
  openForm({
    title: t('orgUi.teams.newTitle'),
    description: t('orgUi.teams.newDesc'),
    fields: [
      { key: 'name', label: t('orgUi.teams.name'), placeholder: t('orgUi.teams.namePlaceholder'), required: true },
      { key: 'description', label: t('orgUi.teams.description'), type: 'textarea', placeholder: t('orgUi.teams.descPlaceholder') },
    ],
    submitLabel: t('orgUi.teams.create'),
    onConfirm: async (v) => {
      try {
        const g = await createGroup(activeOrgId.value!, (v.name ?? ''), v.description || '')
        toast(t('orgUi.teams.created', { name: g.name }))
        await load()   // plus de scope d'équipe où descendre (oto#192) : la liste suffit
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}

function rename(g: GroupListItem) {
  openForm({
    title: t('orgUi.teams.editTitle'),
    fields: [
      { key: 'name', label: t('orgUi.teams.name'), initial: g.name, required: true },
      { key: 'description', label: t('orgUi.teams.description'), type: 'textarea', initial: g.description },
    ],
    submitLabel: t('orgUi.teams.save'),
    onConfirm: async (v) => {
      try { await updateGroup(g.id, { name: (v.name ?? ''), description: v.description || '' }); toast(t('orgUi.teams.saved')); await load() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
function openTeam(g: GroupListItem) { router.push(`/org/teams/${g.id}`) }

async function removeGroup(g: GroupListItem) {
  if (!await confirmAction({ title: t('orgUi.teams.deleteTitle'), danger: true, confirmLabel: t('orgUi.teams.delete'), message: t('orgUi.teams.deleteMessage') })) return
  try { await deleteGroup(g.id); toast(t('orgUi.teams.deleted')); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" :title="t('orgUi.teams.noOrg')">
      <div class="helptext">{{ t('orgUi.teams.noOrgHelp') }}</div>
    </ConsoleCard>

    <ConsoleCard v-else :title="t('orgUi.teams.title')" flush
      :sub="t('orgUi.teams.sub')">
      <template #actions>
        <Btn v-if="orgAdmin" kind="mini" icon="plus" @click="create">{{ t('orgUi.teams.new') }}</Btn>
      </template>
      <table class="tbl">
        <thead><tr><th>{{ t('orgUi.teams.team') }}</th><th>{{ t('orgUi.teams.you') }}</th><th style="width: 190px"></th></tr></thead>
        <tbody>
          <tr v-for="g in groups" :key="g.id">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ g.name }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">{{ t('orgUi.teams.membersCount', { n: g.member_count }, g.member_count) }}<span v-if="g.description"> · {{ g.description }}</span></div>
            </td>
            <td>
              <Tag v-if="g.my_role === 'group_admin'" tone="ink">{{ t('orgUi.teams.lead') }}</Tag>
              <Tag v-else-if="g.my_role === 'group_member'">{{ t('orgUi.teams.member') }}</Tag>
              <span v-else class="dim" style="font-size: 11px">—</span>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <Btn v-if="orgAdmin || g.my_role != null" kind="mini" @click="openTeam(g)">{{ t('orgUi.teams.members') }}</Btn>
              <Btn v-if="canManageConnectors(g)" kind="mini" @click="openConnectors(g)">{{ t('orgUi.teams.connectors') }}</Btn>
              <template v-if="orgAdmin">
                <Btn kind="mini" @click="rename(g)">{{ t('orgUi.teams.edit') }}</Btn>
                <Btn kind="danger" @click="removeGroup(g)">{{ t('orgUi.teams.delete') }}</Btn>
              </template>
            </td>
          </tr>
          <tr v-if="!groups.length"><td colspan="3" class="dim" style="text-align: center; padding: 16px">{{ t('orgUi.teams.none') }}<span v-if="orgAdmin">{{ t('orgUi.teams.createOne') }}</span>.</td></tr>
        </tbody>
      </table>
    </ConsoleCard>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>
