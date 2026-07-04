<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import OtoLoading from './OtoLoading.vue'
import ColumnFilterCell from './ColumnFilterCell.vue'
import type { ColumnFilter, DatastoreRow } from '@/types/api'
import { cellKind, cellShort, absDate, relDate } from '@/lib/cellRender'
import {
  buildFilters, columnFilterKind, defaultOp, filterChipLabel,
  type ColFilterState, type FilterKind,
} from '@/lib/datastoreFilters'

// Grille SERVER-DRIVEN : tri/pagination/recherche/filtres côté API (le parent fetch).
// Ce composant n'affiche que la page courante et émet les changements.
const props = defineProps<{
  rows: DatastoreRow[]
  total: number
  page: number              // 0-based
  pageSize: number
  sortField: string | null
  sortDir: 'asc' | 'desc'
  search: string
  filters: ColumnFilter[]
  loading?: boolean
}>()
const emit = defineEmits<{
  (e: 'open', row: DatastoreRow): void
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', size: number): void
  (e: 'update:sort', field: string, dir: 'asc' | 'desc'): void
  (e: 'update:search', q: string): void
  (e: 'update:filters', filters: ColumnFilter[]): void
}>()

const META = new Set(['_id', '_created_at', '_updated_at'])
const DEFAULT_SORT = '_updated_at'
const PAGE_SIZES = [25, 50, 100]

// Colonnes = champs user de la page courante (ordre de 1re apparition) + « updated ».
const fields = computed<string[]>(() => {
  const seen: string[] = []
  for (const row of props.rows)
    for (const k of Object.keys(row))
      if (!META.has(k) && !seen.includes(k)) seen.push(k)
  return seen
})
const columns = computed(() => [...fields.value, '_updated_at'])

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const rangeText = computed(() => {
  if (!props.total) return '0 rows'
  const from = props.page * props.pageSize + 1
  const to = Math.min(props.total, (props.page + 1) * props.pageSize)
  return `${from}–${to} / ${props.total}`
})

function header(col: string): string { return col === '_updated_at' ? 'updated' : col }
function sortGlyph(col: string): string {
  if (props.sortField !== col) return '↕'
  return props.sortDir === 'desc' ? '↓' : '↑'
}
// Tri 3 états : desc → asc → retour au tri par défaut (« updated », plus récent d'abord).
function toggleSort(col: string) {
  if (props.sortField !== col) emit('update:sort', col, 'desc')
  else if (props.sortDir === 'desc') emit('update:sort', col, 'asc')
  else if (col === DEFAULT_SORT) emit('update:sort', col, 'desc')
  else emit('update:sort', DEFAULT_SORT, 'desc')
}
function sortTitle(col: string): string {
  if (props.sortField !== col) return `trier par ${header(col)}`
  return props.sortDir === 'desc' ? 'tri croissant' : (col === DEFAULT_SORT ? 'inverser' : 'annuler le tri')
}
function cellVal(row: DatastoreRow, col: string): unknown {
  return col === '_updated_at' ? row._updated_at : row[col]
}

// Recherche : local + debounce → émission (le parent refetch & reset la page).
const searchLocal = ref(props.search)
let timer: ReturnType<typeof setTimeout> | null = null
watch(() => props.search, (v) => { searchLocal.value = v })
watch(searchLocal, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('update:search', v), 300)
})

// ── filtres par colonne (server-side via le parent) ──────────────────────────
const showFilters = ref(false)
// État local par champ user (source de vérité des inputs). On NE reseed PAS depuis
// props.filters à chaque refetch (éviter les sauts de curseur) — seulement les
// champs que l'état local ne connaît pas encore (restauration deep-link, montage)
// et le reset externe (changement de namespace → props.filters=[]) qui vide tout.
const local = reactive<Record<string, ColFilterState>>({})
const kindCache = new Map<string, FilterKind>()
function colKind(field: string): FilterKind {
  let k = kindCache.get(field)
  if (!k) { k = columnFilterKind(props.rows, field); kindCache.set(field, k) }
  return k
}
function modelFor(field: string): ColFilterState {
  return local[field] ?? { op: defaultOp(colKind(field)), value: '' }
}
let ftimer: ReturnType<typeof setTimeout> | null = null
function onCell(field: string, v: ColFilterState) {
  local[field] = v
  if (ftimer) clearTimeout(ftimer)
  ftimer = setTimeout(() => emit('update:filters', buildFilters(local)), 300)
}
function clearFilters() {
  for (const k of Object.keys(local)) delete local[k]
  emit('update:filters', [])
}
function clearAll() {
  searchLocal.value = ''
  clearFilters()
}
// Chips = les filtres APPLIQUÉS (props), retirables un à un sans ouvrir la ligne.
const chips = computed(() =>
  props.filters.map((f) => ({ field: f.field, label: filterChipLabel(f, colKind(f.field)) })))
function removeChip(field: string) {
  delete local[field]
  emit('update:filters', buildFilters(local))
}
const activeFilterCount = computed(() => props.filters.length)
watch(() => props.rows, () => kindCache.clear())  // colonnes/typage peuvent changer de namespace
watch(() => props.filters, (f) => {
  if (!f.length) {
    if (Object.keys(local).length) for (const k of Object.keys(local)) delete local[k]
    return
  }
  for (const cf of f)
    if (!local[cf.field])
      local[cf.field] = { op: cf.op, value: Array.isArray(cf.value) ? cf.value.join(',') : cf.value }
}, { immediate: true })
</script>

<template>
  <div class="dt">
    <div class="dt-bar">
      <div class="dt-search">
        <Icon name="search" :size="14" />
        <input v-model="searchLocal" class="dt-search-input" placeholder="search…"
          @keydown.esc="searchLocal = ''" />
      </div>
      <button class="dt-filter-toggle" :class="{ on: showFilters || activeFilterCount }"
        :title="showFilters ? 'hide column filters' : 'filter by column'"
        @click="showFilters = !showFilters">
        filters<span v-if="activeFilterCount" class="dt-filter-badge">{{ activeFilterCount }}</span>
      </button>
      <button v-if="activeFilterCount" class="dt-filter-clear" @click="clearFilters">Clear</button>
      <span class="dim dt-count">{{ total }} row{{ total === 1 ? '' : 's' }}</span>
    </div>

    <div v-if="chips.length" class="dt-chips">
      <button v-for="c in chips" :key="c.field" class="dt-chip"
        :title="`retirer le filtre sur ${c.field}`" @click="removeChip(c.field)">
        {{ c.label }}<span class="dt-chip-x">×</span>
      </button>
    </div>

    <div class="tbl-scroll">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col" class="dt-th"
              :class="{ num: col === '_updated_at', sorted: sortField === col }"
              :title="sortTitle(col)" @click="toggleSort(col)">
              <span class="dt-th-inner">{{ header(col) }}<span class="dt-sort">{{ sortGlyph(col) }}</span></span>
            </th>
          </tr>
          <tr v-if="showFilters" class="dt-filter-row">
            <th v-for="col in columns" :key="col">
              <ColumnFilterCell v-if="col !== '_updated_at'" :field="col" :kind="colKind(col)"
                :model-value="modelFor(col)" @update:model-value="onCell(col, $event)" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row._id" class="dt-row" @click="emit('open', row)">
            <td v-for="col in columns" :key="col" :class="{ num: col === '_updated_at' }">
              <span v-if="col === '_updated_at'" class="dim mono" :title="absDate(String(cellVal(row, col) ?? ''))">
                {{ relDate(cellVal(row, col)) }}
              </span>
              <a v-else-if="cellKind(cellVal(row, col)) === 'url'" :href="String(cellVal(row, col))"
                target="_blank" rel="noopener" class="dt-link" @click.stop>
                {{ cellShort(cellVal(row, col)) }}
              </a>
              <span v-else-if="cellKind(cellVal(row, col)) === 'date'" class="mono"
                :title="relDate(cellVal(row, col))">
                {{ absDate(String(cellVal(row, col))) }}
              </span>
              <span v-else-if="cellKind(cellVal(row, col)) === 'number'" class="num mono">
                {{ cellShort(cellVal(row, col)) }}
              </span>
              <span v-else :title="cellShort(cellVal(row, col))">{{ cellShort(cellVal(row, col)) }}</span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="columns.length" class="dim" style="text-align: center; padding: 16px">
              <OtoLoading v-if="loading" label="chargement…" style="justify-content: center" />
              <template v-else-if="search || filters.length">
                no rows match —
                <button class="dt-clear-inline" @click="clearAll">Clear filters &amp; search</button>
              </template>
              <template v-else>no rows match.</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="total" class="dt-pager">
      <span class="dim dt-range">{{ rangeText }}</span>
      <div v-if="pageCount > 1" class="dt-pager-nav">
        <Btn kind="ghost" :disabled="page <= 0" title="première page" @click="emit('update:page', 0)">«</Btn>
        <Btn kind="ghost" :disabled="page <= 0" @click="emit('update:page', page - 1)">‹ Prev</Btn>
        <span class="dim">page {{ page + 1 }} / {{ pageCount }}</span>
        <Btn kind="ghost" :disabled="page >= pageCount - 1" @click="emit('update:page', page + 1)">Next ›</Btn>
        <Btn kind="ghost" :disabled="page >= pageCount - 1" title="dernière page"
          @click="emit('update:page', pageCount - 1)">»</Btn>
      </div>
      <label class="dim dt-psize">
        <select :value="pageSize"
          @change="emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))">
          <option v-for="s in PAGE_SIZES" :key="s" :value="s">{{ s }}</option>
        </select>
        / page
      </label>
    </div>
  </div>
</template>

<style scoped>
.dt-bar { display: flex; align-items: center; gap: 12px; padding: 8px var(--pad-card); }
.dt-search { display: flex; align-items: center; gap: 6px; flex: 1; color: var(--color-mute); }
.dt-search-input {
  flex: 1; font: inherit; font-size: 12.5px; border: 0; background: none;
  color: var(--color-ink); outline: none;
}
.dt-count { font-size: 11px; white-space: nowrap; }
.dt-filter-toggle, .dt-filter-clear {
  font: inherit; font-size: 11px; cursor: pointer; border: 1px solid var(--color-hair);
  background: var(--color-surface); color: var(--color-mute); border-radius: var(--radius-md);
  padding: 2px 8px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
}
.dt-filter-toggle.on { color: var(--color-cobalt); border-color: var(--color-cobalt); }
.dt-filter-clear { border-color: transparent; color: var(--color-faint); }
.dt-filter-clear:hover { color: var(--color-terra-ink); }
.dt-filter-badge {
  font-size: 10px; background: var(--color-cobalt); color: var(--color-paper);
  border-radius: var(--radius-md); padding: 0 5px; line-height: 1.5;
}
.dt-chips {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 0 var(--pad-card) 8px;
}
.dt-chip {
  font: inherit; font-size: 11px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--color-cobalt); border-radius: var(--radius-pill); padding: 1px 8px;
  background: var(--color-surface); color: var(--color-cobalt); max-width: 260px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dt-chip:hover { background: var(--color-paper-3); }
.dt-chip-x { color: var(--color-faint); font-size: 12px; }
.dt-chip:hover .dt-chip-x { color: var(--color-terra-ink); }
.dt-clear-inline {
  font: inherit; font-size: inherit; border: 0; background: none; cursor: pointer;
  color: var(--color-cobalt); text-decoration: underline; padding: 0;
}
/* En-tête sticky : le scroll vertical vit dans .tbl-scroll, les deux lignes de
   thead restent visibles (hauteur de la 1re ligne figée → offset déterministe). */
.dt { --dt-head-h: 30px; }
.tbl-scroll { overflow: auto; max-height: min(65vh, 640px); }
.dt thead th { position: sticky; z-index: 2; background: var(--color-surface); }
.dt thead tr:first-child th { top: 0; height: var(--dt-head-h); }
.dt thead tr.dt-filter-row th { top: var(--dt-head-h); }
.dt-filter-row th { padding: 4px var(--cell-pad, 8px) 6px; vertical-align: top; }
.dt-th { cursor: pointer; user-select: none; white-space: nowrap; }
.dt-th-inner { display: inline-flex; align-items: center; gap: 4px; }
.dt-sort { color: var(--color-faint); }
.dt-th.sorted .dt-sort { color: var(--color-cobalt); }
.dt-row { cursor: pointer; }
.tbl-scroll .tbl td {
  max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dt-link { color: var(--color-cobalt); text-decoration: none; }
.dt-link:hover { text-decoration: underline; }
.dt-pager {
  display: flex; align-items: center; gap: 12px; padding: 8px var(--pad-card);
}
.dt-pager-nav { display: flex; align-items: center; gap: 8px; margin-inline: auto; }
.dt-range { font-size: 11px; white-space: nowrap; }
.dt-psize { font-size: 11px; margin-left: auto; white-space: nowrap; }
.dt-pager-nav + .dt-psize { margin-left: 0; }
.dt-psize select {
  font: inherit; font-size: 11px; border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  background: var(--color-surface); color: var(--color-mute); padding: 1px 4px; cursor: pointer;
}
</style>
