<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import DataTable from '@/components/console/DataTable.vue'
import DatastoreCards from '@/components/console/DatastoreCards.vue'
import RowDrawer from '@/components/console/RowDrawer.vue'
import ShareDialog from '@/components/console/ShareDialog.vue'
import NameDialog from '@/components/console/NameDialog.vue'
import NamespaceCreateDialog from '@/components/console/NamespaceCreateDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useTransferOwnership } from '@/composables/useTransferOwnership'
import { useMe } from '@/composables/useMe'
import { useDeepLink } from '@/composables/useDeepLink'
import {
  getNamespaces, createNamespace, deleteNamespace, renameNamespace, transferNamespace,
  getNamespaceRows, appendNamespaceRow, updateNamespaceRow, deleteNamespaceRow,
} from '@/api/console'
import type { NamespaceEntry, DatastoreRow, ColumnFilter } from '@/types/api'
import { humanize } from '@/lib/errors'
import { rowsToCsv, downloadCsv } from '@/lib/csv'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { pickTarget } = useTransferOwnership()
const { me } = useMe()
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
// ADR 0030 : droits dérivés du payload (owner-match ∪ grant ∪ gouvernance).
const readOnly = computed(() => !!current.value && current.value.can_write === false)
const canGovern = computed(() => !!current.value?.can_govern)
// Mode typé (ADR 0032 §6, B6b) : un namespace à schéma s'affiche en FICHES par
// défaut (rendu via les rôles), avec bascule vers le tableau plat.
const isTyped = computed(() => !!current.value?.schema?.fields?.length)
const cardView = ref(true)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

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
// ── création / renommage (dialogs validés) ────────────────────────────────────
const createOpen = ref(false)
const renameOpen = ref(false)
const activeOrgName = computed(() => (me.value?.active_org ? (me.value?.active_org_name || 'mon org') : null))

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

async function doCreate(payload: { name: string; scope: 'user' | 'org' }) {
  const activeOrg = me.value?.active_org
  const owner = payload.scope === 'org' && activeOrg ? { type: 'org', id: activeOrg } : undefined
  try {
    await createNamespace(payload.name, owner)
    toast(`namespace "${payload.name}" created`)
    await load()
    const created = namespaces.value.find((n) => n.namespace === payload.name)
    if (created) await open(created.id)
  } catch (e) { toast(humanize(e)); throw e }
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

async function doRename(next: string) {
  const name = currentName.value
  if (!name || next === name) return
  try {
    await renameNamespace(name, next)
    toast(`renamed to "${next}"`)
    await load()        // id inchangé → currentName se met à jour, l'URL reste valide
    await fetchRows()
  } catch (e) { toast(humanize(e)); throw e }
}

async function transfer() {
  const name = currentName.value
  if (!name) return
  const target = await pickTarget(name)   // une de tes orgs, ou un autre utilisateur
  if (!target) return
  try {
    await transferNamespace(name, target)
    toast('transféré (tu gardes l\'accès en écriture)')
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
          <Btn kind="mini" icon="plus" @click="createOpen = true">new</Btn>
        </template>
        <div class="rowlist">
          <button v-for="ns in namespaces" :key="ns.id"
            class="rowitem ns-item" :class="{ active: ns.id === selectedId }"
            @click="open(ns.id)">
            <code class="mono" style="font-weight: 600">{{ ns.namespace }}</code>
            <Tag v-if="ns.owner_type === 'org'" tone="cobalt">org</Tag>
            <Tag v-else-if="ns.owner_type === 'group'" tone="cobalt">team</Tag>
            <Tag v-else-if="ns.shared" tone="cobalt">shared · {{ ns.permission || 'read' }}</Tag>
            <Tag v-if="ns.schema?.fields?.length" tone="olive">typé</Tag>
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
          <Btn v-if="isTyped" kind="mini" @click="cardView = !cardView">
            {{ cardView ? 'vue table' : 'vue fiches' }}
          </Btn>
          <Btn kind="mini" icon="doc" :disabled="exporting || !total" @click="exportCsv">
            {{ exporting ? 'exporting…' : 'export csv' }}
          </Btn>
          <Btn v-if="!readOnly" kind="mini" icon="plus" @click="openNew">add row</Btn>
          <template v-if="canGovern">
            <Btn kind="mini" icon="users" @click="shareOpen = true">share</Btn>
            <Btn kind="mini" icon="pen" @click="renameOpen = true">rename</Btn>
            <Btn kind="mini" icon="ext" @click="transfer">transfer</Btn>
            <Btn kind="danger" icon="trash" @click="removeNamespace">delete</Btn>
          </template>
        </template>

        <div v-if="current.schema?.fields?.length" class="ds-schema">
          <span class="dim" style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em">schéma typé</span>
          <span v-for="f in current.schema.fields" :key="f.key" class="ds-field">
            <code class="mono">{{ f.label || f.key }}</code>
            <span v-if="f.role" class="ds-role">{{ f.role }}</span>
          </span>
          <span class="dim" style="font-size: 11px">— déclaré par l'agent (<code style="font-size: 11px">data_set_schema</code>)</span>
        </div>

        <p v-if="rowsError" class="helptext" style="color: var(--color-terra-ink); padding: 12px 16px">
          {{ rowsError }}
        </p>
        <div v-else-if="!rowsLoading && !total && !search && !filters.length" class="dim" style="text-align: center; padding: 24px">
          no rows yet — add one above, or your agents append with
          <code style="font-size: 11px">data_write("{{ currentName }}", row)</code>.
        </div>
        <template v-else-if="isTyped && cardView">
          <DatastoreCards :rows="rows" :schema="current.schema!" @open="openRow" />
          <div v-if="pageCount > 1" class="ds-pager">
            <button class="pj-x" :disabled="page <= 0" @click="onPage(page - 1)">‹ préc.</button>
            <span class="dim" style="font-size: 12px">page {{ page + 1 }} / {{ pageCount }}</span>
            <button class="pj-x" :disabled="page >= pageCount - 1" @click="onPage(page + 1)">suiv. ›</button>
          </div>
        </template>
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
    <NamespaceCreateDialog v-model:open="createOpen" :org-name="activeOrgName" :on-confirm="doCreate" />
    <NameDialog v-model:open="renameOpen" title="renommer le namespace" label="nouveau nom"
      :initial="currentName ?? ''" submit-label="renommer" :on-confirm="doRename" />
  </div>
</template>

<style scoped>
.data-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: var(--gap, 16px);
  align-items: start;
}
.ds-schema { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--color-hair-soft, #e6e6e3); }
.ds-field { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
.ds-role { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-olive-ink, #5a6a3a); background: var(--color-olive-soft, #eef0e6); border-radius: 4px; padding: 1px 5px; }
.ds-pager { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 10px 16px; }
.ds-pager .pj-x { border: 1px solid var(--color-hair-soft, #cfcfcf); background: #fff; border-radius: 6px; padding: 4px 10px; font-size: 12px; color: var(--color-ink-soft, #6b6b6b); cursor: pointer; }
.ds-pager .pj-x:disabled { opacity: .4; cursor: default; }
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
