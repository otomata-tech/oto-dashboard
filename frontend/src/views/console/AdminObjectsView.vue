<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { listResources, transferResource } from '@/api/console'
import type { ResourceEntry } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

// Object-browser admin (ADR 0030) — projection PLATEFORME : lister/gouverner les
// objets possédés, dérivé du registre de capacités (`oto_resource`). v1 = un type
// (datastore_namespace) ; l'ossature accueille les types suivants sans réécriture.
// Plan GOUVERNANCE uniquement : on voit owner + métadonnées + on transfère, JAMAIS
// le contenu des lignes (privacy by default — lecture = view-as audité).

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

const TYPES = [{ value: 'datastore_namespace', label: 'datastores' }]
const type = ref('datastore_namespace')
const resources = ref<ResourceEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const count = computed(() => resources.value.length)

async function load() {
  loading.value = true
  error.value = null
  try {
    resources.value = (await listResources(type.value)).resources
  } catch (e) { error.value = humanize(e) }
  finally { loading.value = false }
}
onMounted(load)

function ownerTone(t?: string): 'cobalt' | 'olive' {
  return t === 'org' || t === 'group' ? 'cobalt' : 'olive'
}

function transfer(r: ResourceEntry) {
  openForm({
    title: 'transfer ownership',
    fields: [
      { key: 'email', label: 'new owner email', required: true, placeholder: 'user@email.com',
        hint: `${r.namespace ?? r.resource_id} → nouveau propriétaire (l'ancien garde un accès write).` },
    ],
    onConfirm: async (v) => {
      const email = (v.email ?? '').trim()
      const ok = await confirmAction({
        title: 'transfer ownership?', danger: true, confirmLabel: 'Transfer',
        message: `give "${r.namespace ?? r.resource_id}" to ${email}? the previous owner keeps write access.`,
      })
      if (!ok) throw new Error('cancelled')
      try {
        await transferResource(type.value, r.resource_id, { email })
        toast(`transferred to ${email}`)
        await load()
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="statrow">
      <Stat :value="String(count)" label="objects" />
    </div>

    <ConsoleCard title="owned objects" flush
      sub="govern resources across the platform — transfer ownership without reading content.">
      <template #actions>
        <select v-model="type" class="o-select" @change="load">
          <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <Btn kind="mini" icon="refresh" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </Btn>
      </template>

      <div v-if="!loading && !count" class="dim" style="text-align: center; padding: 24px">
        no objects of this type.
      </div>

      <table v-else class="o-table">
        <thead>
          <tr>
            <th>namespace</th>
            <th>owner</th>
            <th class="num">rows</th>
            <th>created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in resources" :key="r.resource_id">
            <td><code class="mono" style="font-weight: 600">{{ r.namespace ?? r.resource_id }}</code></td>
            <td>
              <Tag :tone="ownerTone(r.owner_type)">{{ r.owner_type }}</Tag>
              <span class="dim" style="margin-left: 6px">{{ r.owner_label ?? r.owner_id }}</span>
            </td>
            <td class="num">{{ r.row_count ?? '—' }}</td>
            <td class="dim">{{ r.created_at ? fmtDate(r.created_at) : '—' }}</td>
            <td class="num">
              <Btn kind="mini" icon="ext" @click="transfer(r)">Transfer</Btn>
            </td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
.o-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.o-table th, .o-table td {
  text-align: left; padding: 8px var(--pad-card);
  border-bottom: 1px solid var(--color-hair-soft);
}
.o-table th { font-weight: 600; color: var(--color-ink-soft); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.o-table .num { text-align: right; }
.o-select {
  font: inherit; font-size: 12px; padding: 3px 8px; border-radius: 6px;
  border: 1px solid var(--color-hair-soft); background: var(--color-surface); color: inherit;
}
.statrow { margin-bottom: var(--gap, 16px); }
</style>
