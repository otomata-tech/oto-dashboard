<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import type { DatastoreRow } from '@/types/api'
import { cellKind, cellShort, absDate, relDate } from '@/lib/cellRender'

// Grille SERVER-DRIVEN : tri/pagination/recherche côté API (le parent fetch).
// Ce composant n'affiche que la page courante et émet les changements.
const props = defineProps<{
  rows: DatastoreRow[]
  total: number
  page: number              // 0-based
  pageSize: number
  sortField: string | null
  sortDir: 'asc' | 'desc'
  search: string
  loading?: boolean
}>()
const emit = defineEmits<{
  (e: 'open', row: DatastoreRow): void
  (e: 'update:page', page: number): void
  (e: 'update:sort', field: string, dir: 'asc' | 'desc'): void
  (e: 'update:search', q: string): void
}>()

const META = new Set(['_id', '_created_at', '_updated_at'])

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

function header(col: string): string { return col === '_updated_at' ? 'updated' : col }
function sortGlyph(col: string): string {
  if (props.sortField !== col) return '↕'
  return props.sortDir === 'desc' ? '↓' : '↑'
}
function toggleSort(col: string) {
  if (props.sortField === col) emit('update:sort', col, props.sortDir === 'desc' ? 'asc' : 'desc')
  else emit('update:sort', col, 'desc')
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
</script>

<template>
  <div class="dt">
    <div class="dt-bar">
      <div class="dt-search">
        <Icon name="search" :size="14" />
        <input v-model="searchLocal" class="dt-search-input" placeholder="search…" />
      </div>
      <span class="dim dt-count">{{ total }} row{{ total === 1 ? '' : 's' }}</span>
    </div>

    <div class="tbl-scroll">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col" class="dt-th"
              :class="{ num: col === '_updated_at' }" @click="toggleSort(col)">
              <span class="dt-th-inner">{{ header(col) }}<span class="dt-sort">{{ sortGlyph(col) }}</span></span>
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
              {{ loading ? 'loading…' : 'no rows match.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pageCount > 1" class="dt-pager">
      <Btn kind="ghost" :disabled="page <= 0" @click="emit('update:page', page - 1)">‹ prev</Btn>
      <span class="dim">page {{ page + 1 }} / {{ pageCount }}</span>
      <Btn kind="ghost" :disabled="page >= pageCount - 1" @click="emit('update:page', page + 1)">next ›</Btn>
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
