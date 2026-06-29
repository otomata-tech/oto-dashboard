<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import DataTable from '@/components/console/DataTable.vue'
import RowDrawer from '@/components/console/RowDrawer.vue'
import ShareDialog from '@/components/console/ShareDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useDeepLink } from '@/composables/useDeepLink'
import {
  getNamespaces, createNamespace, deleteNamespace, renameNamespace, transferNamespace,
  getNamespaceRows, appendNamespaceRow, updateNamespaceRow, deleteNamespaceRow,
} from '@/api/console'
import type { NamespaceEntry, DatastoreRow, ColumnFilter } from '@/types/api'
import { humanize } from '@/lib/errors'
import { rowsToCsv, downloadCsv } from '@/lib/csv'

const { toast } = useToast()
const { promptText, confirmAction } = usePrompt()
const PAGE_SIZE = 25

const namespaces = ref<NamespaceEntry[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

const selectedId = ref<number | null>(null)
const rows = ref<DatastoreRow[]>([])
const total = ref(0)
const rowsLoading = ref(false)
const rowsError = ref<string | null>(null)

// État de pagination/tri/recherche/filtres — tout côté serveur.
const page = ref(0)
const sortField = ref<string | null>('_updated_at')
const sortDir = ref<'asc' | 'desc'>('desc')
const search = ref('')
const filters = ref<ColumnFilter[]>([])
const exporting = ref(false)

const META = new Set(['_id', '_created_at', '_updated_at'])

// Deeplink par **id** (stable au renommage) : `?ns=<id>`.
const dl = useDeepLink<number>('ns', (id) => {
  if (id != null && id !== selectedId.value) open(id)
  else if (id == null && selectedId.value != null) { selectedId.value = null; rows.value = [] }
}, { parse: Number })

const current = computed(() => namespaces.value.find((n) => n.id === selectedId.value) || null)
const currentName = computed(() => current.value?.namespace ?? null)
const readOnly = computed(() => !!current.value?.shared && current.value.permission !== 'write')
const isOwner = computed(() => !!current.value && !current.value.shared)

const fields = computed<string[]>(() => {
  const seen: string[] = []
  for (const row of rows.value)
    for (const k of Object.keys(row))
      if (!META.has(k) && !seen.includes(k)) seen.push(k)
  return seen
})

// ── drawer (détail / édition / ajout) ────────────────────────────────────────
const drawerOpen = ref(false)
const drawerRow = ref<DatastoreRow | null>(null)
const drawerNew = ref(false)
function openRow(row: DatastoreRow) { drawerRow.value = row; drawerNew.value = false; drawerOpen.value = true }
function openNew() { drawerRow.value = null; drawerNew.value = true; drawerOpen.value = true }
function closeDrawer() { drawerOpen.value = false; drawerRow.value = null; drawerNew.value = false }

// ── partage ──────────────────────────────────────────────────────────────────
const shareOpen = ref(false)

async function load() {
  try { namespaces.value = (await getNamespaces()).namespaces }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(async () => {
  await load()
  const id = dl.read()
  if (id != null) await open(id)
})

async function fetchRows() {
  const name = currentName.value
  if (!name) return
  rowsLoading.value = true
  rowsError.value = null
  try {
    const r = await getNamespaceRows(name, {
      offset: page.value * PAGE_SIZE, limit: PAGE_SIZE,
      orderBy: sortField.value ?? undefined, orderDir: sortDir.value,
      q: search.value || undefined,
      filters: filters.value.length ? filters.value : undefined,
    })
    rows.value = r.rows
    total.value = r.total
  } catch (e) { rowsError.value = humanize(e); rows.value = []; total.value = 0 }
  finally { rowsLoading.value = false }
}

async function open(id: number) {
  selectedId.value = id
  dl.set(id)
  closeDrawer()
  page.value = 0; sortField.value = '_updated_at'; sortDir.value = 'desc'; search.value = ''; filters.value = []
  await fetchRows()
}

function onPage(p: number) { page.value = p; fetchRows() }
function onSort(field: string, dir: 'asc' | 'desc') { sortField.value = field; sortDir.value = dir; page.value = 0; fetchRows() }
function onSearch(q: string) { search.value = q; page.value = 0; fetchRows() }
function onFilters(f: ColumnFilter[]) { filters.value = f; page.value = 0; fetchRows() }

// Export CSV du jeu FILTRÉ (mêmes tri/recherche/filtres), paginé pour couvrir tout
// le vivier (la page UI plafonne à PAGE_SIZE ; l'API à 500/req).
async function exportCsv() {
  const name = currentName.value
  if (!name || exporting.value) return
  exporting.value = true
  try {
    const all: DatastoreRow[] = []
    const STEP = 500
    for (let off = 0; ; off += STEP) {
      const r = await getNamespaceRows(name, {
        offset: off, limit: STEP,
        orderBy: sortField.value ?? undefined, orderDir: sortDir.value,
        q: search.value || undefined,
        filters: filters.value.length ? filters.value : undefined,
      })
      all.push(...r.rows)
      if (off + STEP >= r.total || !r.rows.length) break
    }
    const META = new Set(['_created_at'])
    const cols: string[] = []
    for (const row of all) for (const k of Object.keys(row)) if (!META.has(k) && !cols.includes(k)) cols.push(k)
    downloadCsv(`${name}.csv`, rowsToCsv(all as Record<string, unknown>[], cols))
    toast(`${all.length} row${all.length === 1 ? '' : 's'} exported`)
  } catch (e) { toast(humanize(e)) }
  finally { exporting.value = false }
}

async function create() {
  const ns = await promptText('new namespace', { label: 'name', required: true, placeholder: 'e.g. prospects-q3' })
  if (!ns) return
  try {
    await createNamespace(ns)
    toast(`namespace "${ns}" created`)
    await load()
    const created = namespaces.value.find((n) => n.namespace === ns)
    if (created) await open(created.id)
  } catch (e) { toast(humanize(e)) }
}

async function removeNamespace() {
  const name = currentName.value
  if (!name) return
  const ok = await confirmAction({
    title: `delete "${name}"?`,
    message: 'the namespace and all its rows are removed. this cannot be undone.',
    confirmLabel: 'delete', danger: true,
  })
  if (!ok) return
  try {
    await deleteNamespace(name)
    toast(`namespace "${name}" deleted`)
    selectedId.value = null; rows.value = []; dl.set(null)
    await load()
  } catch (e) { toast(humanize(e)) }
}

async function rename() {
  const name = currentName.value
  if (!name) return
  const next = await promptText('rename namespace', { label: 'new name', required: true, placeholder: name })
  if (!next || next === name) return
  try {
    await renameNamespace(name, next)
    toast(`renamed to "${next}"`)
    await load()        // id inchangé → currentName se met à jour, l'URL reste valide
    await fetchRows()
  } catch (e) { toast(humanize(e)) }
}

async function transfer() {
  const name = currentName.value
  if (!name) return
  const email = await promptText('transfer ownership', { label: 'recipient email', required: true, placeholder: 'user@email.com' })
  if (!email) return
  const ok = await confirmAction({
    title: 'transfer ownership?', danger: true, confirmLabel: 'transfer',
    message: `give "${name}" to ${email}? you keep write access as a shared member.`,
  })
  if (!ok) return
  try {
    await transferNamespace(name, email)
    toast(`transferred to ${email}`)
    await load()        // le ns reste listé (tu passes en partagé), id stable
    await fetchRows()
  } catch (e) { toast(humanize(e)) }
}

async function onSave(payload: Record<string, unknown>) {
  const name = currentName.value
  if (!name) return
  try {
    if (drawerNew.value) {
      await appendNamespaceRow(name, payload)
      toast('row added')
    } else if (drawerRow.value) {
      await updateNamespaceRow(name, drawerRow.value._id, payload)
      toast('row saved')
    }
    closeDrawer()
    await fetchRows()
  } catch (e) { toast(humanize(e)) }
}

async function onDelete() {
  const name = currentName.value
  if (!name || !drawerRow.value) return
  const id = drawerRow.value._id
  const ok = await confirmAction({
    title: 'delete row?', message: 'this row is permanently removed.',
    confirmLabel: 'delete', danger: true,
  })
  if (!ok) return
  try {
    await deleteNamespaceRow(name, id)
    toast('row deleted')
    closeDrawer()
    await fetchRows()
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
          <button v-for="ns in namespaces" :key="ns.id"
            class="rowitem ns-item" :class="{ active: ns.id === selectedId }"
            @click="open(ns.id)">
            <code class="mono" style="font-weight: 600">{{ ns.namespace }}</code>
            <Tag v-if="ns.shared" tone="cobalt">shared · {{ ns.permission || 'read' }}</Tag>
          </button>
          <div v-if="loaded && !namespaces.length" class="dim" style="text-align: center; padding: 16px">
            no namespaces yet — create one to let your agents store rows.
          </div>
        </div>
      </ConsoleCard>

      <!-- contenu du namespace sélectionné -->
      <ConsoleCard v-if="current" :title="currentName || ''" flush
        :sub="rowsLoading ? 'loading…' : `${total} row${total === 1 ? '' : 's'}`">
        <template #actions>
          <Tag v-if="readOnly" tone="saffron">read-only</Tag>
          <Btn kind="mini" icon="doc" :disabled="exporting || !total" @click="exportCsv">
            {{ exporting ? 'exporting…' : 'export csv' }}
          </Btn>
          <Btn v-if="!readOnly" kind="mini" icon="plus" @click="openNew">add row</Btn>
          <template v-if="isOwner">
            <Btn kind="mini" icon="users" @click="shareOpen = true">share</Btn>
            <Btn kind="mini" icon="pen" @click="rename">rename</Btn>
            <Btn kind="mini" icon="ext" @click="transfer">transfer</Btn>
            <Btn kind="danger" icon="trash" @click="removeNamespace">delete</Btn>
          </template>
        </template>

        <p v-if="rowsError" class="helptext" style="color: var(--color-terra-ink); padding: 12px 16px">
          {{ rowsError }}
        </p>
        <div v-else-if="!rowsLoading && !total && !search && !filters.length" class="dim" style="text-align: center; padding: 24px">
          no rows yet — add one above, or your agents append with
          <code style="font-size: 11px">data_write("{{ currentName }}", row)</code>.
        </div>
        <DataTable v-else :rows="rows" :total="total" :page="page" :page-size="PAGE_SIZE"
          :sort-field="sortField" :sort-dir="sortDir" :search="search" :filters="filters" :loading="rowsLoading"
          @open="openRow" @update:page="onPage" @update:sort="onSort" @update:search="onSearch"
          @update:filters="onFilters" />
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
    <ShareDialog :open="shareOpen" :namespace="currentName" @close="shareOpen = false" />
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
