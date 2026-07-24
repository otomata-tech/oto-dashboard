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
import DatastoreMetrics from '@/components/console/DatastoreMetrics.vue'
import DatastoreQueueBar from '@/components/console/DatastoreQueueBar.vue'
import DatastoreStatusBar from '@/components/console/DatastoreStatusBar.vue'
import RowDrawer from '@/components/console/RowDrawer.vue'
import SharePrincipalDialog from '@/components/console/SharePrincipalDialog.vue'
import NameDialog from '@/components/console/NameDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useTransferOwnership } from '@/composables/useTransferOwnership'
import {
  getNamespaces, getNamespaceRows, getNamespaceRow, getNamespaceAggregate,
  getNamespaceQueue, releaseRowClaim,
  appendNamespaceRow, updateNamespaceRow, deleteNamespaceRow,
  deleteNamespace, renameNamespace,
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
const { transfer: runTransfer } = useTransferOwnership()
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

// ── cockpit (ADR 0046 b1) : DÉRIVÉ du schéma v2 — le field role="status" avec
// un lifecycle donne une barre de statuts (compteurs serveur) + filtre 1-clic.
const statusField = computed(() =>
  (meta.value?.schema?.fields ?? []).find((f) => f.role === 'status') ?? null)
const lifecycleStates = computed<string[]>(() =>
  statusField.value?.lifecycle?.states ?? [])
const cockpit = computed(() => !!statusField.value && lifecycleStates.value.length > 0)
const statusCounts = ref<Record<string, number>>({})
const statusTotal = ref(0)
const activeStatus = computed<string | null>(() => {
  const k = statusField.value?.key
  if (!k) return null
  const f = filters.value.find((x) => x.field === k && x.op === 'eq')
  return f ? String(f.value) : null
})
async function fetchStatusCounts() {
  const n = name.value
  const k = statusField.value?.key
  if (!n || !k || !cockpit.value) return
  try {
    const { groups } = await getNamespaceAggregate(n, { groupBy: k })
    const counts: Record<string, number> = {}
    let tot = 0
    for (const g of groups) {
      const v = g[k]
      const c = Number(g.count ?? 0)
      counts[v == null ? '—' : String(v)] = c
      tot += c
    }
    statusCounts.value = counts
    statusTotal.value = tot
  } catch { statusCounts.value = {}; statusTotal.value = 0 }
}
function onStatusSelect(state: string | null) {
  const k = statusField.value?.key
  if (!k) return
  const rest = filters.value.filter((x) => x.field !== k)
  onFilters(state === null ? rest : [...rest, { field: k, op: 'eq', value: state }])
}

// ── tuiles metric (ADR 0046) : sum/avg SERVEUR des champs role="metric" (number),
// sur le MÊME jeu filtré que la table (q + filters) — refetch quand ils changent.
const metricFields = computed(() => (meta.value?.schema?.fields ?? [])
  .filter((f) => f.role === 'metric' && (f.type ?? 'number') === 'number'))
const metricTiles = ref<Array<{ key: string; label: string; value: string; sub?: string }>>([])
const numFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
async function fetchMetricTiles() {
  const n = name.value
  if (!n || !metricFields.value.length) { metricTiles.value = []; return }
  try {
    const metrics = metricFields.value.flatMap((f) => [
      { op: 'sum' as const, field: f.key }, { op: 'avg' as const, field: f.key }])
    const { groups } = await getNamespaceAggregate(n, {
      metrics,
      q: search.value || undefined,
      filters: filters.value.length ? filters.value : undefined,
    })
    const g = groups[0] ?? {}
    metricTiles.value = metricFields.value.flatMap((f) => {
      const sum = g[`sum_${f.key}`]
      const avg = g[`avg_${f.key}`]
      if (sum == null && avg == null) return []
      return [{
        key: f.key,
        label: `total ${f.label || f.key}`,
        value: sum == null ? '—' : numFmt.format(Number(sum)),
        sub: avg == null ? undefined : `moy. ${numFmt.format(Number(avg))}`,
      }]
    })
  } catch { metricTiles.value = [] }
}

// ── file de travail (ADR 0046 D) : rows sous bail + libération forcée.
const queueRows = ref<DatastoreRow[]>([])
const titleFieldKey = computed(() =>
  (meta.value?.schema?.fields ?? []).find((f) => f.role === 'title')?.key ?? null)
async function fetchQueue() {
  const n = name.value
  if (!n) { queueRows.value = []; return }
  try { queueRows.value = (await getNamespaceQueue(n)).rows } catch { queueRows.value = [] }
}
async function onRelease(rowId: string) {
  const n = name.value
  if (!n) return
  try {
    await releaseRowClaim(n, rowId)
    toast('bail libéré')
    closeDrawer()
    await Promise.all([fetchQueue(), fetchRows()])
  } catch (e) { toast(humanize(e)) }
}
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
    const found = all.find((n) => String(n.id) === props.nsRef || n.namespace === props.nsRef)
    if (found) { meta.value = found; return }
    // Introuvable SANS exception (tableau d'une autre org, ou renommé) : ne pas
    // laisser meta=null muet → page blanche. Poser une erreur actionnable.
    meta.value = null
    rowsError.value = 'Tableau introuvable dans ce contexte — il appartient peut-être à une autre organisation.'
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
  resetDrawer()
  await resolveMeta()
  readTableQuery()
  await fetchRows()
  await openFromRoute()   // deep-link `…/item/<rowId>` → drawer ouvert sur la fiche
  await fetchStatusCounts()
  void fetchMetricTiles()
  void fetchQueue()
}

function onPage(p: number) { page.value = p; syncTableQuery(); fetchRows() }
function onSort(field: string, dir: 'asc' | 'desc') { sortField.value = field; sortDir.value = dir; page.value = 0; syncTableQuery(); fetchRows() }
function onSearch(q: string) { search.value = q; page.value = 0; syncTableQuery(); fetchRows(); void fetchMetricTiles() }
function onFilters(f: ColumnFilter[]) { filters.value = f; page.value = 0; syncTableQuery(); fetchRows(); void fetchMetricTiles() }
function onPageSize(ps: number) { pageSize.value = ps; page.value = 0; syncTableQuery(); fetchRows() }

// ── drawer (détail / édition / ajout) — la fiche ouverte est DANS l'URL
// (`…/item/<rowId>`, deep-link partageable). Ouvrir/fermer = replace du path ;
// `resetDrawer` ferme SANS toucher l'URL (rechargements internes, sinon le
// reload initial effacerait le segment porté par le deep-link).
const drawerOpen = ref(false)
const drawerRow = ref<DatastoreRow | null>(null)
const drawerNew = ref(false)
const itemBasePath = computed(() => route.path.replace(/\/item\/[^/]+$/, ''))
const routeRowId = computed<string | null>(() => {
  const v = route.params.rowId
  return typeof v === 'string' && v ? v : null
})
function openRow(row: DatastoreRow) {
  drawerRow.value = row; drawerNew.value = false; drawerOpen.value = true
  if (routeRowId.value !== row._id)
    void router.replace({ path: `${itemBasePath.value}/item/${row._id}`, query: route.query })
}
function openNew() { drawerRow.value = null; drawerNew.value = true; drawerOpen.value = true }
function resetDrawer() { drawerOpen.value = false; drawerRow.value = null; drawerNew.value = false }
function closeDrawer() {
  resetDrawer()
  if (routeRowId.value)
    void router.replace({ path: itemBasePath.value, query: route.query })
}
// Ouvre la fiche portée par l'URL : dans la page courante si présente, sinon
// fetch dédié (la row peut être hors page/filtre). Row inconnue = table nue.
async function openFromRoute() {
  const id = routeRowId.value
  const n = name.value
  if (!id || !n || (drawerOpen.value && drawerRow.value?._id === id)) return
  try {
    const row = rows.value.find((r) => r._id === id) ?? await getNamespaceRow(n, id)
    drawerRow.value = row; drawerNew.value = false; drawerOpen.value = true
  } catch { /* row supprimée / autre namespace : on laisse la table */ }
}
watch(routeRowId, (id) => { if (id) void openFromRoute(); else resetDrawer() })

// nsRef → recharge. `immediate` DOIT être déclaré APRÈS le bloc drawer : `reload`
// appelle `closeDrawer()` qui lit `drawerOpen`/`drawerRow`/`drawerNew` ; placé plus
// haut, le watch immédiat tourne pendant le setup avant l'init de ces refs → TDZ
// (« Cannot access … before initialization », OTO-DASHBOARD-8).
watch(() => props.nsRef, reload, { immediate: true })

async function onSave(payload: Record<string, unknown>) {
  const n = name.value
  if (!n) return
  try {
    if (drawerNew.value) { await appendNamespaceRow(n, payload); toast('row added') }
    else if (drawerRow.value) { await updateNamespaceRow(n, drawerRow.value._id, payload); toast('row saved') }
    closeDrawer(); await fetchRows(); void fetchStatusCounts(); void fetchMetricTiles(); void fetchQueue()
  } catch (e) { toast(humanize(e)) }
}
async function onDelete() {
  const n = name.value
  if (!n || !drawerRow.value) return
  const id = drawerRow.value._id
  if (!await confirmAction({ title: 'delete row?', message: 'this row is permanently removed.', confirmLabel: 'delete', danger: true })) return
  try { await deleteNamespaceRow(n, id); toast('row deleted'); closeDrawer(); await fetchRows(); void fetchStatusCounts(); void fetchMetricTiles(); void fetchQueue() }
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
  const id = meta.value?.id
  if (id == null) return
  // Chemin unique `oto_resource` (par id du namespace) — garde-fou anti-lockout inclus.
  try {
    const ok = await runTransfer('datastore_namespace', id, name.value ?? `#${id}`, { allowTeams: true })
    if (ok) { toast('transféré (tu gardes l\'accès en écriture)'); await resolveMeta(); await fetchRows(); emit('changed') }
  } catch (e) { toast(humanize(e)) }
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

    <DatastoreStatusBar v-if="cockpit" :states="lifecycleStates" :counts="statusCounts"
      :active="activeStatus" :total="statusTotal" @select="onStatusSelect" />

    <DatastoreMetrics v-if="metricTiles.length" :tiles="metricTiles" />

    <DatastoreQueueBar v-if="queueRows.length" :rows="queueRows" :can-write="!readOnly"
      :title-field="titleFieldKey" @open="openRow" @release="onRelease" />

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
      :read-only="readOnly" :schema="meta.schema ?? null" :namespace="name"
      @save="onSave" @delete="onDelete" @close="closeDrawer"
      @release="drawerRow && onRelease(drawerRow._id)" />
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
