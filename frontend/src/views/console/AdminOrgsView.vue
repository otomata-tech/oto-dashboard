<script setup lang="ts">
// Liste des orgs (admin plateforme) — LISTE SEULE : cliquer une org ouvre sa fiche
// en sous-page /platform/orgs/:id (AdminOrgView, meta.detail='admin-org'). Fin du
// master-détail empilé (refonte /platform 2026-07-23).
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import Avatar from '@/components/console/Avatar.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import SortTh from '@/components/console/SortTh.vue'
import PlatformFinder from '@/components/console/PlatformFinder.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { useFormDialog } from '@/composables/useFormDialog'
import { getAdminOrgs, createOrg } from '@/api/console'
import type { AdminOrgSummary } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const router = useRouter()
const orgs = ref<AdminOrgSummary[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)
// Recherche et tri : portés par ConsoleTable (le filtre maison d'à côté est retiré).
// `PlatformFinder`, au-dessus, reste : il trouve aussi un COMPTE pour « voir en tant que ».
const searchOf = (o: AdminOrgSummary) => `${o.name} ${o.domain ?? ''}`
const sorts = { nom: (o: AdminOrgSummary) => o.name, membres: (o: AdminOrgSummary) => o.member_count }
function open(id: number) {
  router.push(`/platform/orgs/${id}`)
}

onMounted(async () => {
  try { orgs.value = (await getAdminOrgs()).orgs }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
})

function newOrg() {
  openForm({
    title: 'nouvelle organisation',
    fields: [
      { key: 'name', label: 'nom', required: true, placeholder: 'ex. Acme Corp' },
    ],
    onConfirm: async (v) => {
      const name = (v.name ?? '').trim()
      try { const { id } = await createOrg(name); toast(`org « ${name} » créée`); open(id) }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <PlatformFinder :orgs="orgs" @select-org="open" />

    <div class="grid3">
      <Stat label="organisations" :value="orgs.length" sub="périmètres partagés" />
      <Stat label="membres totaux" :value="orgs.reduce((a, o) => a + o.member_count, 0)" sub="toutes orgs confondues" />
      <Stat label="la plus grande" :value="orgs.length ? Math.max(...orgs.map((o) => o.member_count)) : 0" sub="membres dans une org" />
    </div>

    <ConsoleCard flush title="organisations"
      sub="périmètres partagés : les membres héritent des clés d'org, du readme agent, des procédures et des entitlements. clique une org pour la gérer.">
      <template #actions>
        <Btn kind="mini" icon="plus" @click="newOrg">Nouvelle org</Btn>
      </template>
      <ConsoleTable :rows="orgs" :busy="!loaded" :loaded="loaded" empty="aucune organisation"
        :search="searchOf" search-placeholder="nom ou domaine…"
        :sorts="sorts" :default-sort="{ key: 'nom', dir: 'asc' }">
        <template #head="{ sort }">
          <SortTh k="nom" :sort="sort">org</SortTh><SortTh k="membres" :sort="sort" num>membres</SortTh>
          <th style="width: 70px"></th>
        </template>
        <template #row="{ row: o }">
          <tr style="cursor: pointer" @click="open(o.id)">
            <td>
              <div style="display: flex; align-items: center; gap: 9px">
                <Avatar :src="o.logo_url" :name="o.name" :size="24" shape="square" />
                <span style="font-weight: 600; color: var(--color-ink)">{{ o.name }}</span>
              </div>
            </td>
            <td class="num">{{ o.member_count }}</td>
            <td style="text-align: right"><Btn kind="mini" @click.stop="open(o.id)">Gérer</Btn></td>
          </tr>
        </template>
      </ConsoleTable>
    </ConsoleCard>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>
