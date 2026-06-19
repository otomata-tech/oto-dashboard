<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
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

// Édition : id de la row en cours (ou NEW pour l'ajout), brouillon string→string,
// colonnes ajoutées à la volée (schéma libre).
const NEW = '__new__'
const editing = ref<string | null>(null)
const draft = ref<Record<string, string>>({})
const extraCols = ref<string[]>([])
const saving = ref(false)

const META = new Set(['_id', '_created_at', '_updated_at'])

// Colonnes = union des champs user (ordre de première apparition) + celles ajoutées
// pendant une édition en cours.
const columns = computed<string[]>(() => {
  const seen: string[] = []
  for (const row of rows.value)
    for (const k of Object.keys(row))
      if (!META.has(k) && !seen.includes(k)) seen.push(k)
  for (const c of extraCols.value) if (!seen.includes(c)) seen.push(c)
  return seen
})

const current = computed(() => namespaces.value.find((n) => n.namespace === selected.value) || null)
const readOnly = computed(() => !!current.value?.shared && current.value.permission !== 'write')

// Affichage d'une valeur en cellule.
function fmt(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
function fmtDate(v: unknown): string {
  return v ? String(v).replace('T', ' ').slice(0, 16) : ''
}
// String d'input ⇄ valeur. JSON si possible (nombre/bool/null/objet), sinon string.
function toInput(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
function parseVal(s: string): unknown {
  const t = s.trim()
  if (t === '') return ''
  try { return JSON.parse(t) } catch { return s }
}

async function load() {
  try { namespaces.value = (await getNamespaces()).namespaces }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

async function open(ns: string) {
  selected.value = ns
  cancelEdit()
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
    if (selected.value === ns) { selected.value = null; rows.value = [] }
    await load()
  } catch (e) { toast(humanize(e)) }
}

// ── édition ────────────────────────────────────────────────────────────────
function startEdit(row: DatastoreRow) {
  editing.value = row._id
  extraCols.value = []
  const d: Record<string, string> = {}
  for (const c of columns.value) d[c] = toInput(row[c])
  draft.value = d
}
function startNew() {
  editing.value = NEW
  extraCols.value = []
  const d: Record<string, string> = {}
  for (const c of columns.value) d[c] = ''
  draft.value = d
}
function cancelEdit() {
  editing.value = null
  draft.value = {}
  extraCols.value = []
}
async function addField() {
  const name = await promptText('add field', { label: 'field name', required: true, placeholder: 'e.g. status' })
  if (!name) return
  if (META.has(name) || name in draft.value) { toast(`field "${name}" already exists`); return }
  extraCols.value.push(name)
  draft.value[name] = ''
}
async function saveEdit() {
  if (!selected.value || !editing.value) return
  saving.value = true
  try {
    if (editing.value === NEW) {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(draft.value))
        if (v.trim() !== '') payload[k] = parseVal(v)
      const created = await appendNamespaceRow(selected.value, payload)
      rows.value = [created, ...rows.value]
      toast('row added')
    } else {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(draft.value)) payload[k] = parseVal(v)
      const updated = await updateNamespaceRow(selected.value, editing.value, payload)
      rows.value = rows.value.map((r) => (r._id === updated._id ? updated : r))
      toast('row saved')
    }
    cancelEdit()
  } catch (e) { toast(humanize(e)) }
  finally { saving.value = false }
}

async function removeRow(row: DatastoreRow) {
  if (!selected.value) return
  const ok = await confirmAction({
    title: 'delete row?', message: 'this row is permanently removed.',
    confirmLabel: 'delete', danger: true,
  })
  if (!ok) return
  try {
    await deleteNamespaceRow(selected.value, row._id)
    rows.value = rows.value.filter((r) => r._id !== row._id)
    toast('row deleted')
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
          <template v-if="!readOnly && editing">
            <Btn kind="mini" icon="plus" @click="addField">field</Btn>
            <Btn kind="mini" icon="check" :disabled="saving" @click="saveEdit">save</Btn>
            <Btn kind="ghost" icon="close" @click="cancelEdit">cancel</Btn>
          </template>
          <template v-else-if="!readOnly">
            <Btn kind="mini" icon="plus" @click="startNew">add row</Btn>
            <Btn kind="danger" icon="trash" @click="removeNamespace(selected)">delete namespace</Btn>
          </template>
        </template>

        <p v-if="rowsError" class="helptext" style="color: var(--color-terra-ink); padding: 12px 16px">
          {{ rowsError }}
        </p>

        <div v-else-if="!rowsLoading && !rows.length && editing !== NEW" class="dim" style="text-align: center; padding: 24px">
          no rows yet — add one above, or your agents append with
          <code style="font-size: 11px">data_write("{{ selected }}", row)</code>.
        </div>

        <div v-else class="tbl-scroll">
          <table class="tbl">
            <thead>
              <tr>
                <th v-for="c in columns" :key="c">{{ c }}</th>
                <th class="num">updated</th>
                <th v-if="!readOnly" style="width: 88px"></th>
              </tr>
            </thead>
            <tbody>
              <!-- ligne d'ajout -->
              <tr v-if="editing === NEW" class="editing">
                <td v-for="c in columns" :key="c">
                  <input v-model="draft[c]" class="cell-input" :placeholder="c" />
                </td>
                <td class="num dim">—</td>
                <td style="text-align: right; white-space: nowrap">
                  <Btn kind="mini" icon="check" :disabled="saving" @click="saveEdit" />
                  <Btn kind="ghost" icon="close" @click="cancelEdit" />
                </td>
              </tr>
              <!-- lignes existantes -->
              <tr v-for="row in rows" :key="row._id" :class="{ editing: editing === row._id }">
                <template v-if="editing === row._id">
                  <td v-for="c in columns" :key="c">
                    <input v-model="draft[c]" class="cell-input" :placeholder="c" />
                  </td>
                  <td class="num dim mono">{{ fmtDate(row._updated_at) }}</td>
                  <td style="text-align: right; white-space: nowrap">
                    <Btn kind="mini" icon="check" :disabled="saving" @click="saveEdit" />
                    <Btn kind="ghost" icon="close" @click="cancelEdit" />
                  </td>
                </template>
                <template v-else>
                  <td v-for="c in columns" :key="c" :title="fmt(row[c])">{{ fmt(row[c]) }}</td>
                  <td class="num dim mono">{{ fmtDate(row._updated_at) }}</td>
                  <td v-if="!readOnly" style="text-align: right; white-space: nowrap">
                    <Btn kind="ghost" icon="pen" :disabled="!!editing" @click="startEdit(row)" />
                    <Btn kind="danger" icon="trash" :disabled="!!editing" @click="removeRow(row)" />
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
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
  background: none;
  border: 0;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.ns-item.active { background: var(--color-paper-3); }
/* table large → scroll horizontal plutôt que de casser la grille */
.tbl-scroll { overflow-x: auto; }
.tbl-scroll .tbl td {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tbl tr.editing { background: var(--color-paper-3); }
.tbl tr.editing td { overflow: visible; white-space: normal; }
.cell-input {
  width: 100%;
  min-width: 90px;
  font: inherit;
  font-size: 12.5px;
  padding: 4px 6px;
  border: 1px solid var(--color-hair-soft);
  border-radius: 5px;
  background: var(--color-surface);
  color: var(--color-ink);
}
.cell-input:focus {
  outline: none;
  border-color: var(--color-cobalt);
}
</style>
