<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel,
  useVueTable, type ColumnDef, type SortingState, type Row,
} from '@tanstack/vue-table'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import type { DatastoreRow } from '@/types/api'
import { cellKind, cellShort, absDate, relDate, sortValue } from '@/lib/cellRender'

const props = defineProps<{ rows: DatastoreRow[] }>()
const emit = defineEmits<{ (e: 'open', row: DatastoreRow): void }>()

const META = new Set(['_id', '_created_at', '_updated_at'])

// Colonnes = union des champs user (ordre de 1re apparition) + 1 colonne méta
// « updated » à la fin, toutes dérivées des rows (schéma libre).
const fields = computed<string[]>(() => {
  const seen: string[] = []
  for (const row of props.rows)
    for (const k of Object.keys(row))
      if (!META.has(k) && !seen.includes(k)) seen.push(k)
  return seen
})

const columns = computed<ColumnDef<DatastoreRow>[]>(() => {
  const cols: ColumnDef<DatastoreRow>[] = fields.value.map((f) => ({
    id: f,
    accessorFn: (row) => row[f],
    header: f,
    sortingFn: (a: Row<DatastoreRow>, b: Row<DatastoreRow>, id) => {
      const va = sortValue(a.getValue(id)); const vb = sortValue(b.getValue(id))
      return va < vb ? -1 : va > vb ? 1 : 0
    },
  }))
  cols.push({
    id: '_updated_at',
    accessorFn: (row) => row._updated_at,
    header: 'updated',
    sortingFn: (a, b, id) => {
      const va = sortValue(a.getValue(id)); const vb = sortValue(b.getValue(id))
      return va < vb ? -1 : va > vb ? 1 : 0
    },
  })
  return cols
})

const sorting = ref<SortingState>([])
const globalFilter = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 25 })

function globalFilterFn(row: Row<DatastoreRow>, _id: string, value: string): boolean {
  const q = String(value).toLowerCase()
  if (!q) return true
  return Object.entries(row.original).some(
    ([k, v]) => !k.startsWith('_') && String(v ?? '').toLowerCase().includes(q),
  )
}

const table = useVueTable({
  get data() { return props.rows },
  get columns() { return columns.value },
  state: {
    get sorting() { return sorting.value },
    get globalFilter() { return globalFilter.value },
    get pagination() { return pagination.value },
  },
  onSortingChange: (u) => { sorting.value = typeof u === 'function' ? u(sorting.value) : u },
  onGlobalFilterChange: (u) => { globalFilter.value = typeof u === 'function' ? u(globalFilter.value) : u },
  onPaginationChange: (u) => { pagination.value = typeof u === 'function' ? u(pagination.value) : u },
  globalFilterFn,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
})

const headerCols = computed(() => table.getHeaderGroups()[0]?.headers ?? [])
const filteredCount = computed(() => table.getFilteredRowModel().rows.length)
const pageCount = computed(() => table.getPageCount())
const pageIndex = computed(() => pagination.value.pageIndex)

function sortGlyph(id: string): string {
  const s = sorting.value.find((x) => x.id === id)
  return !s ? '↕' : s.desc ? '↓' : '↑'
}
</script>

<template>
  <div class="dt">
    <div class="dt-bar">
      <div class="dt-search">
        <Icon name="search" :size="14" />
        <input v-model="globalFilter" class="dt-search-input" placeholder="search…" />
      </div>
      <span class="dim dt-count">{{ filteredCount }} / {{ rows.length }}</span>
    </div>

    <div class="tbl-scroll">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="header in headerCols" :key="header.id"
              :class="{ num: header.id === '_updated_at' }"
              class="dt-th" @click="header.column.toggleSorting()">
              <span class="dt-th-inner">
                {{ header.column.columnDef.header }}
                <span class="dt-sort">{{ sortGlyph(header.id) }}</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in table.getRowModel().rows" :key="row.id"
            class="dt-row" @click="emit('open', row.original)">
            <td v-for="cell in row.getVisibleCells()" :key="cell.id"
              :class="{ num: cell.column.id === '_updated_at' }">
              <!-- colonne méta updated : relatif + absolu au survol -->
              <span v-if="cell.column.id === '_updated_at'" class="dim mono"
                :title="absDate(String(cell.getValue() ?? ''))">
                {{ relDate(cell.getValue()) }}
              </span>
              <!-- url → lien cliquable (sans déclencher l'ouverture de la row) -->
              <a v-else-if="cellKind(cell.getValue()) === 'url'" :href="String(cell.getValue())"
                target="_blank" rel="noopener" class="dt-link" @click.stop>
                {{ cellShort(cell.getValue()) }}
              </a>
              <!-- date → absolu, relatif au survol -->
              <span v-else-if="cellKind(cell.getValue()) === 'date'" class="mono"
                :title="relDate(cell.getValue())">
                {{ absDate(String(cell.getValue())) }}
              </span>
              <span v-else-if="cellKind(cell.getValue()) === 'number'" class="num mono">
                {{ cellShort(cell.getValue()) }}
              </span>
              <span v-else :title="cellShort(cell.getValue())">{{ cellShort(cell.getValue()) }}</span>
            </td>
          </tr>
          <tr v-if="!table.getRowModel().rows.length">
            <td :colspan="columns.length" class="dim" style="text-align: center; padding: 16px">
              no rows match.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pageCount > 1" class="dt-pager">
      <Btn kind="ghost" :disabled="!table.getCanPreviousPage()" @click="table.previousPage()">‹ prev</Btn>
      <span class="dim">page {{ pageIndex + 1 }} / {{ pageCount }}</span>
      <Btn kind="ghost" :disabled="!table.getCanNextPage()" @click="table.nextPage()">next ›</Btn>
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
.tbl-scroll { overflow-x: auto; }
.dt-th { cursor: pointer; user-select: none; white-space: nowrap; }
.dt-th-inner { display: inline-flex; align-items: center; gap: 4px; }
.dt-sort { color: var(--color-faint); }
.dt-row { cursor: pointer; }
.tbl-scroll .tbl td {
  max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dt-link { color: var(--color-cobalt); text-decoration: none; }
.dt-link:hover { text-decoration: underline; }
.dt-pager { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px; }
</style>
