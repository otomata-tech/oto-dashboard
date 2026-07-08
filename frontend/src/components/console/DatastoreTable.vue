<script setup lang="ts">
// Vue COMPLÈTE d'un tableau du datastore (un namespace) : lignes + tri/recherche/
// filtres/pagination server-driven (état MIROIR dans l'URL), fiches typées, drawer
// d'édition, export CSV, et gouvernance (partage / renommage / transfert / suppression).
// Extrait de DataView pour être réutilisable : la page /data l'affiche pour le
// namespace sélectionné, et la page projet l'affiche INLINE (/projects/:id/data/:ns).
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import DataTable from '@/components/console/DataTable.vue'
import DatastoreCards from '@/components/console/DatastoreCards.vue'
import RowDrawer from '@/components/console/RowDrawer.vue'
import SharePrincipalDialog from '@/components/console/SharePrincipalDialog.vue'
import NameDialog from '@/components/console/NameDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useTransferOwnership } from '@/composables/useTransferOwnership'
import {
  getNamespaces, getNamespaceRows, appendNamespaceRow, updateNamespaceRow, deleteNamespaceRow,
  deleteNamespace, renameNamespace, transferNamespace,
} from '@/api/console'
import type { NamespaceEntry, DatastoreRow, ColumnFilter } from '@/types/api'
import { humanize } from '@/lib/errors'
import { rowsToCsv, downloadCsv } from '@/lib/csv'
import { filtersFromParam, filtersToParam } from '@/lib/datastoreFilters'

const props = defineProps<{
  // Réf du namespace (id BIGSERIAL en texte, ou nom) — le lien projet porte le nom.
  nsRef: string
  // Meta déjà connu du parent (évite un refetch ; sinon le composant le charge).
  nsMeta?: NamespaceEntry | null
  // Actions de gouvernance (share/rename/transfer/delete). Défaut: affichées.
  govern?: boolean
}>()
const emit = defineEmits<{ changed: []; deleted: [] }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { pickTarget } = useTransferOwnership()
const route = useRoute()
const router = useRouter()

const DEFAULT_PAGE_SIZE = 25
const PAGE_SIZES = [25, 50, 100]
const META = new Set(['_id', '_created_at', '_updated_at'])
const TABLE_QUERY_KEYS = ['q', 'sort', 'dir', 'page', 'ps', 'f']

const meta = ref<NamespaceEntry | null>(props.nsMeta ?? null)
const rows = ref<DatastoreRow[]>([])
const total = ref(0)
const rowsLoading = ref(false)
const rowsError = ref<string | null>(null)

const page = ref(0)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const sortField = ref<string | null>('_updated_at')
const sortDir = ref<'asc' | 'desc'>('desc')
const search = ref('')
const filters = ref<ColumnFilter[]>([])
const exporting = ref(false)

const name = computed(() => meta.value?.namespace ?? null)
const readOnly = computed(() => !!meta.value && meta.value.can_write === false)
const canGovern = computed(() => (props.govern ?? true) && !!meta.value?.can_govern)
const isTyped = computed(() => !!meta.value?.schema?.fields?.length)
const cardView = ref(true)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

const fields = computed<string[]>(() => {
  const seen: string[] = []
  for (const row of rows.value)
    for (const k of Object.keys(row))
      if (!META.has(k) && !seen.includes(k)) seen.push(k)
  return seen
})

function readTableQuery() {
  const q = route.query
  search.value = typeof q.q === 'string' ? q.q : ''
  sortField.value = typeof q.sort === 'string' && q.sort ? q.sort : '_updated_at'
  sortDir.value = q.dir === 'asc' ? 'asc' : 'desc'
  const ps = Number(q.ps)
  pageSize.value = PAGE_SIZES.includes(ps) ? ps : DEFAULT_PAGE_SIZE
  const pg = Number(q.page)
  page.value = Number.isInteger(pg) && pg > 1 ? pg - 1 : 0
  filters.value = filtersFromParam(typeof q.f === 'string' ? q.f : null)
}
function syncTableQuery() {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(route.query))
    if (!TABLE_QUERY_KEYS.includes(k) && typeof v === 'string') query[k] = v
  if (search.value) query.q = search.value
  if (sortField.value && (sortField.value !== '_updated_at' || sortDir.value !== 'desc')) {
    query.sort = sortField.value
    query.dir = sortDir.value
  }
  if (pageSize.value !== DEFAULT_PAGE_SIZE) query.ps = String(pageSize.value)
  if (page.value > 0) query.page = String(page.value + 1)
  const f = filtersToParam(filters.value)
  if (f) query.f = f
  void router.replace({ path: route.path, query })
}

async function resolveMeta() {
  if (props.nsMeta && (String(props.nsMeta.id) === props.nsRef || props.nsMeta.namespace === props.nsRef)) {
    meta.value = props.nsMeta
    return
  }
  try {
    const all = (await getNamespaces()).namespaces
    meta.value = all.find((n) => String(n.id) === props.nsRef || n.namespace === props.nsRef) ?? null
  } catch (e) { rowsError.value = humanize(e); meta.value = null }
}

async function fetchRows() {
  const n = name.value
  if (!n) return
  rowsLoading.value = true
  rowsError.value = null
  try {
    const r = await getNamespaceRows(n, {
      offset: page.value * pageSize.value, limit: pageSize.value,
      orderBy: sortField.value ?? undefined, orderDir: sortDir.value,
      q: search.value || undefined,
      filters: filters.value.length ? filters.value : undefined,
    })
    rows.value = r.rows
    total.value = r.total
  } catch (e) { rowsError.value = humanize(e); rows.value = []; total.value = 0 }
  finally { rowsLoading.value = false }
}

async function reload() {
  closeDrawer()
  await resolveMeta()
  readTableQuery()
  await fetchRows()
}
watch(() => props.nsRef, reload, { immediate: true })

function onPage(p: number) { page.value = p; syncTableQuery(); fetchRows() }
function onSort(field: string, dir: 'asc' | 'desc') { sortField.value = field; sortDir.value = dir; page.value = 0; syncTableQuery(); fetchRows() }
function onSearch(q: string) { search.value = q; page.value = 0; syncTableQuery(); fetchRows() }
function onFilters(f: ColumnFilter[]) { filters.value = f; page.value = 0; syncTableQuery(); fetchRows() }
function onPageSize(ps: number) { pageSize.value = ps; page.value = 0; syncTableQuery(); fetchRows() }

// ── drawer (détail / édition / ajout) ──
const drawerOpen = ref(false)
const drawerRow = ref<DatastoreRow | null>(null)
const drawerNew = ref(false)
function openRow(row: DatastoreRow) { drawerRow.value = row; drawerNew.value = false; drawerOpen.value = true }
function openNew() { drawerRow.value = null; drawerNew.value = true; drawerOpen.value = true }
function closeDrawer() { drawerOpen.value = false; drawerRow.value = null; drawerNew.value = false }

async function onSave(payload: Record<string, unknown>) {
  const n = name.value
  if (!n) return
  try {
    if (drawerNew.value) { await appendNamespaceRow(n, payload); toast('row added') }
    else if (drawerRow.value) { await updateNamespaceRow(n, drawerRow.value._id, payload); toast('row saved') }
    closeDrawer(); await fetchRows()
  } catch (e) { toast(humanize(e)) }
}
async function onDelete() {
  const n = name.value
  if (!n || !drawerRow.value) return
  const id = drawerRow.value._id
  if (!await confirmAction({ title: 'delete row?', message: 'this row is permanently removed.', confirmLabel: 'delete', danger: true })) return
  try { await deleteNamespaceRow(n, id); toast('row deleted'); closeDrawer(); await fetchRows() }
  catch (e) { toast(humanize(e)) }
}

// ── export CSV du jeu FILTRÉ (paginé pour couvrir tout le vivier) ──
async function exportCsv() {
  const n = name.value
  if (!n || exporting.value) return
  exporting.value = true
  try {
    const all: DatastoreRow[] = []
    const STEP = 500
    for (let off = 0; ; off += STEP) {
      const r = await getNamespaceRows(n, {
        offset: off, limit: STEP,
        orderBy: sortField.value ?? undefined, orderDir: sortDir.value,
        q: search.value || undefined,
        filters: filters.value.length ? filters.value : undefined,
      })
      all.push(...r.rows)
      if (off + STEP >= r.total || !r.rows.length) break
    }
    const EXP = new Set(['_created_at'])
    const cols: string[] = []
    for (const row of all) for (const k of Object.keys(row)) if (!EXP.has(k) && !cols.includes(k)) cols.push(k)
    downloadCsv(`${n}.csv`, rowsToCsv(all as Record<string, unknown>[], cols))
    toast(`${all.length} row${all.length === 1 ? '' : 's'} exported`)
  } catch (e) { toast(humanize(e)) }
  finally { exporting.value = false }
}

// ── gouvernance (share / rename / transfer / delete) ──
const shareOpen = ref(false)
const renameOpen = ref(false)
async function removeNamespace() {
  const n = name.value
  if (!n) return
  if (!await confirmAction({ title: `delete "${n}"?`, message: 'the namespace and all its rows are removed. this cannot be undone.', confirmLabel: 'delete', danger: true })) return
  try { await deleteNamespace(n); toast(`namespace "${n}" deleted`); emit('deleted') }
  catch (e) { toast(humanize(e)) }
}
async function doRename(next: string) {
  const n = name.value
  if (!n || next === n) return
  try { await renameNamespace(n, next); toast(`renamed to "${next}"`); await resolveMeta(); await fetchRows(); emit('changed') }
  catch (e) { toast(humanize(e)); throw e }
}
async function transfer() {
  const n = name.value
  if (!n) return
  const target = await pickTarget(n)
  if (!target) return
  try { await transferNamespace(n, target); toast('transféré (tu gardes l\'accès en écriture)'); await resolveMeta(); await fetchRows(); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConsoleCard v-if="meta" :title="name || ''" flush
    :sub="rowsLoading ? 'loading…' : `${total} row${total === 1 ? '' : 's'}`">
    <template #actions>
      <Tag v-if="readOnly" tone="saffron">read-only</Tag>
      <Btn v-if="isTyped" kind="mini" @click="cardView = !cardView">{{ cardView ? 'vue table' : 'vue fiches' }}</Btn>
      <Btn kind="mini" icon="doc" :disabled="exporting || !total" @click="exportCsv">{{ exporting ? 'exporting…' : 'export csv' }}</Btn>
      <Btn v-if="!readOnly" kind="mini" icon="plus" @click="openNew">add row</Btn>
      <template v-if="canGovern">
        <Btn kind="mini" icon="users" @click="shareOpen = true">share</Btn>
        <Btn kind="mini" icon="pen" @click="renameOpen = true">rename</Btn>
        <Btn kind="mini" icon="ext" @click="transfer">transfer</Btn>
        <Btn kind="danger" icon="trash" @click="removeNamespace">delete</Btn>
      </template>
    </template>

    <div v-if="meta.schema?.fields?.length" class="ds-schema">
      <span class="dim" style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em">schéma typé</span>
      <span v-for="f in meta.schema.fields" :key="f.key" class="ds-field">
        <code class="mono">{{ f.label || f.key }}</code>
        <span v-if="f.role" class="ds-role">{{ f.role }}</span>
      </span>
    </div>

    <p v-if="rowsError" class="helptext" style="color: var(--color-terra-ink); padding: 12px 16px">{{ rowsError }}</p>
    <div v-else-if="!rowsLoading && !total && !search && !filters.length" class="dim" style="text-align: center; padding: 24px">
      no rows yet — add one above, or your agents append with
      <code style="font-size: 11px">data_write("{{ name }}", row)</code>.
    </div>
    <template v-else-if="isTyped && cardView">
      <DatastoreCards :rows="rows" :schema="meta.schema!" @open="openRow" />
      <div v-if="pageCount > 1" class="ds-pager">
        <button class="pj-x" :disabled="page <= 0" @click="onPage(page - 1)">‹ préc.</button>
        <span class="dim" style="font-size: 12px">page {{ page + 1 }} / {{ pageCount }}</span>
        <button class="pj-x" :disabled="page >= pageCount - 1" @click="onPage(page + 1)">suiv. ›</button>
      </div>
    </template>
    <DataTable v-else :rows="rows" :total="total" :page="page" :page-size="pageSize"
      :sort-field="sortField" :sort-dir="sortDir" :search="search" :filters="filters" :loading="rowsLoading"
      @open="openRow" @update:page="onPage" @update:page-size="onPageSize" @update:sort="onSort"
      @update:search="onSearch" @update:filters="onFilters" />

    <RowDrawer :open="drawerOpen" :row="drawerRow" :fields="fields" :is-new="drawerNew"
      :read-only="readOnly" @save="onSave" @delete="onDelete" @close="closeDrawer" />
    <SharePrincipalDialog :open="shareOpen" resource-type="datastore_namespace"
      :resource-id="String(meta.id)" :resource-label="name ?? undefined"
      @close="shareOpen = false" @changed="emit('changed')" />
    <NameDialog v-model:open="renameOpen" title="renommer le namespace" label="nouveau nom"
      :initial="name ?? ''" submit-label="renommer" :on-confirm="doRename" />
  </ConsoleCard>

  <p v-else-if="rowsError" class="helptext" style="color: var(--color-terra-ink)">{{ rowsError }}</p>
</template>

<style scoped>
.ds-schema { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--color-hair-soft, #e6e6e3); }
.ds-field { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
.ds-role { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-olive-ink, #5a6a3a); background: var(--color-olive-soft, #eef0e6); border-radius: 4px; padding: 1px 5px; }
.ds-pager { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 10px 16px; }
.ds-pager .pj-x { border: 1px solid var(--color-hair-soft, #cfcfcf); background: #fff; border-radius: 6px; padding: 4px 10px; font-size: 12px; color: var(--color-ink-soft, #6b6b6b); cursor: pointer; }
.ds-pager .pj-x:disabled { opacity: .4; cursor: default; }
</style>
