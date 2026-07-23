<script setup lang="ts">
// Liste des orgs (admin plateforme) — LISTE SEULE : cliquer une org ouvre sa fiche
// en sous-page /platform/orgs/:id (AdminOrgView, meta.detail='admin-org'). Fin du
// master-détail empilé (refonte /platform 2026-07-23).
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import Avatar from '@/components/console/Avatar.vue'
import Pager from '@/components/console/Pager.vue'
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
const q = ref('')

const PAGE_SIZE = 25
const page = ref(0)
const filtered = computed(() =>
  orgs.value.filter((o) => !q.value || o.name.toLowerCase().includes(q.value.toLowerCase())),
)
const paged = computed(() =>
  filtered.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE))
watch(q, () => { page.value = 0 })

function open(id: number) {
  router.push(`/platform/orgs/${id}`)
}

onMounted(async () => {
  try { orgs.value = (await getAdminOrgs()).orgs }
  catch (e) { error.value = humanize(e) }
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
        <input v-model="q" class="inp sm" placeholder="filtrer par nom…" style="width: 200px" />
        <Btn kind="mini" icon="plus" @click="newOrg">Nouvelle org</Btn>
      </template>
      <table class="tbl">
        <thead><tr><th>org</th><th class="num">membres</th><th style="width: 70px"></th></tr></thead>
        <tbody>
          <tr v-for="o in paged" :key="o.id" style="cursor: pointer" @click="open(o.id)">
            <td>
              <div style="display: flex; align-items: center; gap: 9px">
                <Avatar :src="o.logo_url" :name="o.name" :size="24" shape="square" />
                <span style="font-weight: 600; color: var(--color-ink)">{{ o.name }}</span>
              </div>
            </td>
            <td class="num">{{ o.member_count }}</td>
            <td style="text-align: right"><Btn kind="mini" @click.stop="open(o.id)">Gérer</Btn></td>
          </tr>
          <tr v-if="!filtered.length"><td colspan="3" class="dim" style="text-align: center; padding: 16px">aucune organisation</td></tr>
        </tbody>
      </table>
      <Pager :total="filtered.length" :page="page" :page-size="PAGE_SIZE" @update:page="page = $event" />
    </ConsoleCard>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>
