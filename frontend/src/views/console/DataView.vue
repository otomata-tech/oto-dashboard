<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import DataTable from '@/components/console/DataTable.vue'
import RowDrawer from '@/components/console/RowDrawer.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useDeepLink } from '@/composables/useDeepLink'
import {
  getNamespaces, createNamespace, deleteNamespace,
  getNamespaceRows, appendNamespaceRow, updateNamespaceRow, deleteNamespaceRow,
} from '@/api/console'
import type { NamespaceEntry, DatastoreRow } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { promptText, confirmAction } = usePrompt()

const namespaces = ref<NamespaceEntry[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

const selected = ref<string | null>(null)
const rows = ref<DatastoreRow[]>([])
const rowsLoading = ref(false)
const rowsError = ref<string | null>(null)

const META = new Set(['_id', '_created_at', '_updated_at'])

// Namespace ouvert porté par `?ns=<name>` (back/forward + lien direct).
const dl = useDeepLink('ns', (ns) => {
  if (ns && ns !== selected.value) open(ns)
  else if (!ns && selected.value) { selected.value = null; rows.value = [] }
})

const current = computed(() => namespaces.value.find((n) => n.namespace === selected.value) || null)
const readOnly = computed(() => !!current.value?.shared && current.value.permission !== 'write')

// Colonnes connues du namespace (union des champs user) — sert le formulaire d'ajout.
const fields = computed<string[]>(() => {
  const seen: string[] = []
  for (const row of rows.value)
    for (const k of Object.keys(row))
      if (!META.has(k) && !seen.includes(k)) seen.push(k)
  return seen
})

// ── drawer (détail / édition / ajout d'une row) ──────────────────────────────
const drawerOpen = ref(false)
const drawerRow = ref<DatastoreRow | null>(null)
const drawerNew = ref(false)

function openRow(row: DatastoreRow) { drawerRow.value = row; drawerNew.value = false; drawerOpen.value = true }
function openNew() { drawerRow.value = null; drawerNew.value = true; drawerOpen.value = true }
function closeDrawer() { drawerOpen.value = false; drawerRow.value = null; drawerNew.value = false }

async function load() {
  try { namespaces.value = (await getNamespaces()).namespaces }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(async () => {
  await load()
  const ns = dl.read()
  if (ns) await open(ns)
})

async function open(ns: string) {
  selected.value = ns
  dl.set(ns)
  closeDrawer()
  rowsError.value = null
  rowsLoading.value = true
  try { rows.value = (await getNamespaceRows(ns)).rows }
  catch (e) { rowsError.value = humanize(e); rows.value = [] }
  finally { rowsLoading.value = false }
}

async function create() {
  const ns = await promptText('new namespace', { label: 'name', required: true, placeholder: 'e.g. prospects-q3' })
  if (!ns) return
  try { await createNamespace(ns); toast(`namespace "${ns}" created`); await load(); await open(ns) }
  catch (e) { toast(humanize(e)) }
}

async function removeNamespace(ns: string) {
  const ok = await confirmAction({
    title: `delete "${ns}"?`,
    message: 'the namespace and all its rows are removed. this cannot be undone.',
    confirmLabel: 'delete', danger: true,
  })
  if (!ok) return
  try {
    await deleteNamespace(ns)
    toast(`namespace "${ns}" deleted`)
    if (selected.value === ns) { selected.value = null; rows.value = []; dl.set(null) }
    await load()
  } catch (e) { toast(humanize(e)) }
}

async function onSave(payload: Record<string, unknown>) {
  if (!selected.value) return
  try {
    if (drawerNew.value) {
      const created = await appendNamespaceRow(selected.value, payload)
      rows.value = [created, ...rows.value]
      toast('row added')
    } else if (drawerRow.value) {
      const updated = await updateNamespaceRow(selected.value, drawerRow.value._id, payload)
      rows.value = rows.value.map((r) => (r._id === updated._id ? updated : r))
      toast('row saved')
    }
    closeDrawer()
  } catch (e) { toast(humanize(e)) }
}

async function onDelete() {
  if (!selected.value || !drawerRow.value) return
  const id = drawerRow.value._id
  const ok = await confirmAction({
    title: 'delete row?', message: 'this row is permanently removed.',
    confirmLabel: 'delete', danger: true,
  })
  if (!ok) return
  try {
    await deleteNamespaceRow(selected.value, id)
    rows.value = rows.value.filter((r) => r._id !== id)
    toast('row deleted')
    closeDrawer()
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="data-layout">
      <!-- liste des namespaces -->
      <ConsoleCard title="namespaces" flush
        sub="tabular storage your agents read &amp; write through data_* tools.">
        <template #actions>
          <Btn kind="mini" icon="plus" @click="create">new</Btn>
        </template>
        <div class="rowlist">
          <button v-for="ns in namespaces" :key="ns.namespace"
            class="rowitem ns-item" :class="{ active: ns.namespace === selected }"
            @click="open(ns.namespace)">
            <code class="mono" style="font-weight: 600">{{ ns.namespace }}</code>
            <Tag v-if="ns.shared" tone="cobalt">shared · {{ ns.permission || 'read' }}</Tag>
          </button>
          <div v-if="loaded && !namespaces.length" class="dim" style="text-align: center; padding: 16px">
            no namespaces yet — create one to let your agents store rows.
          </div>
        </div>
      </ConsoleCard>

      <!-- contenu du namespace sélectionné -->
      <ConsoleCard v-if="selected" :title="selected" flush
        :sub="rowsLoading ? 'loading…' : `${rows.length} row${rows.length === 1 ? '' : 's'}`">
        <template #actions>
          <Tag v-if="readOnly" tone="saffron">read-only</Tag>
          <Btn v-else kind="mini" icon="plus" @click="openNew">add row</Btn>
          <Btn v-if="!readOnly" kind="danger" icon="trash" @click="removeNamespace(selected)">delete namespace</Btn>
        </template>

        <p v-if="rowsError" class="helptext" style="color: var(--color-terra-ink); padding: 12px 16px">
          {{ rowsError }}
        </p>
        <div v-else-if="!rowsLoading && !rows.length" class="dim" style="text-align: center; padding: 24px">
          no rows yet — add one above, or your agents append with
          <code style="font-size: 11px">data_write("{{ selected }}", row)</code>.
        </div>
        <DataTable v-else :rows="rows" @open="openRow" />
      </ConsoleCard>

      <ConsoleCard v-else title="pick a namespace">
        <div class="helptext">select a namespace on the left to view its rows.</div>
      </ConsoleCard>
    </div>

    <div class="grid2">
      <ConsoleCard title="how agents use this">
        <div class="helptext" style="font-size: 12.5px; line-height: 1.65">
          <code style="font-size: 11px">data_write("prospects-q3", row)</code> appends a row ·
          <code style="font-size: 11px">data_rows("prospects-q3", filter)</code> reads it back ·
          <code style="font-size: 11px">data_share("prospects-q3", email)</code> shares it with a teammate.
          schema-free — new fields just appear.
        </div>
      </ConsoleCard>
      <ConsoleCard title="backing store" sub="native, no external dependency.">
        <div class="helptext">
          rows live in oto's own database (postgres) — datastore works without connecting any
          third-party account. exporting a namespace to a tool you control (sheets, notion…) is
          on the roadmap.
        </div>
      </ConsoleCard>
    </div>

    <RowDrawer :open="drawerOpen" :row="drawerRow" :fields="fields" :is-new="drawerNew"
      :read-only="readOnly" @save="onSave" @delete="onDelete" @close="closeDrawer" />
  </div>
</template>

<style scoped>
.data-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: var(--gap, 16px);
  align-items: start;
}
@media (max-width: 720px) {
  .data-layout { grid-template-columns: 1fr; }
}
.ns-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-inline: var(--pad-card);
  background: none;
  border: 0;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.ns-item.active { background: var(--color-paper-3); }
</style>
