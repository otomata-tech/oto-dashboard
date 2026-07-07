<script setup lang="ts">
// Liste des organisations (plateforme). Le détail/gouvernance vit sur la page dédiée
// `/platform/orgs/:id` (AdminOrgView) — comme la fiche user `/platform/users/:sub`.
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { useFormDialog } from '@/composables/useFormDialog'
import { getAdminOrgs, createOrg } from '@/api/console'
import type { AdminOrgSummary } from '@/types/api'
import { humanize } from '@/lib/errors'

const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const orgs = ref<AdminOrgSummary[]>([])
const error = ref<string | null>(null)

async function loadOrgs() { orgs.value = (await getAdminOrgs()).orgs }

onMounted(async () => {
  // Compat deep-link legacy `?org=<id>` (fiche inline avant la page dédiée) → route.
  const legacy = Number(route.query.org)
  if (legacy) { router.replace(`/platform/orgs/${legacy}`); return }
  try { await loadOrgs() } catch (e) { error.value = humanize(e) }
})

function open(id: number) { router.push(`/platform/orgs/${id}`) }

function newOrg() {
  openForm({
    title: 'new organization',
    fields: [{ key: 'name', label: 'name', required: true, placeholder: 'e.g. Acme Corp' }],
    onConfirm: async (v) => {
      const name = (v.name ?? '').trim()
      try { const { id } = await createOrg(name); toast(`org "${name}" created`); router.push(`/platform/orgs/${id}`) }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="grid3">
      <Stat label="organizations" :value="orgs.length" sub="shared perimeters" />
      <Stat label="total members" :value="orgs.reduce((a, o) => a + o.member_count, 0)" sub="across all orgs" />
      <Stat label="largest" :value="orgs.length ? Math.max(...orgs.map((o) => o.member_count)) : 0" sub="members in one org" />
    </div>

    <ConsoleCard flush title="organizations"
      sub="shared perimeters: members inherit org keys, agent readme, procedures and entitlements. click an org to manage it.">
      <template #actions>
        <Btn kind="mini" icon="plus" @click="newOrg">New org</Btn>
      </template>
      <table class="tbl">
        <thead><tr><th>org</th><th class="num">members</th><th style="width: 70px"></th></tr></thead>
        <tbody>
          <tr v-for="o in orgs" :key="o.id" style="cursor: pointer" @click="open(o.id)">
            <td style="font-weight: 600; color: var(--color-ink)">{{ o.name }}</td>
            <td class="num">{{ o.member_count }}</td>
            <td style="text-align: right"><Btn kind="mini" @click.stop="open(o.id)">Manage</Btn></td>
          </tr>
          <tr v-if="!orgs.length"><td colspan="3" class="dim" style="text-align: center; padding: 16px">no organizations</td></tr>
        </tbody>
      </table>
    </ConsoleCard>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>
