<script setup lang="ts" generic="T">
// Table console CLIENT-SIDE du design system — LE composant des tables admin/
// monitoring (listes chargées en un fetch). Il porte ce que chaque vue recopiait :
// chrome `.tbl`, états chargement/vide, pagination usePager intégrée (25/page), et
// depuis le 24/09/2026 la RECHERCHE et le TRI — chaque vue bricolait son propre champ
// de filtre à côté, et aucune liste ne se triait.
//   <ConsoleTable :rows="items" :busy="busy" empty="aucun élément."
//     :search="(r) => `${r.name} ${r.email}`"                  ← champ de recherche
//     :sorts="{ nom: (r) => r.name, cree: (r) => r.created_at }" ← colonnes triables
//     :default-sort="{ key: 'cree', dir: 'desc' }">
//     <template #head="{ sort }"><SortTh k="nom" :sort="sort">nom</SortTh><th>…</th></template>
//     <template #row="{ row }">
//       <tr>…</tr>
//       <tr v-if="expanded === row.id">…</tr>   <!-- drill-down : plusieurs <tr> ok -->
//     </template>
//   </ConsoleTable>
// Monter dans une ConsoleCard `flush`. Pendant server-driven : DataTable (tri/
// filtres côté API). Le colspan 100 des états couvre toute largeur (clampé par HTML).
import { computed, ref } from 'vue'
import Pager from './Pager.vue'
import { usePager } from '@/composables/usePager'
import type { TableSort } from './tableSort'

type SortValue = string | number | null | undefined

const props = withDefaults(defineProps<{
  rows: T[]
  busy?: boolean
  /** false tant que le premier fetch n'a pas abouti (masque l'état vide). */
  loaded?: boolean
  empty?: string
  pageSize?: number
  /** Le texte cherchable d'une ligne ; présent = un champ de recherche au-dessus. */
  search?: (row: T) => string
  searchPlaceholder?: string
  /** Les colonnes triables : une clé → la valeur de tri d'une ligne. */
  sorts?: Record<string, (row: T) => SortValue>
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
}>(), { loaded: true, search: undefined, sorts: undefined, defaultSort: undefined })

const q = ref('')
const sortKey = ref(props.defaultSort?.key ?? null)
const sortDir = ref<'asc' | 'desc'>(props.defaultSort?.dir ?? 'asc')

// Recherche sans casse ni accents : « celeste » trouve « Céleste ».
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const view = computed<T[]>(() => {
  let out = props.rows
  const needle = fold(q.value.trim())
  if (needle && props.search) out = out.filter((r) => fold(props.search!(r) ?? '').includes(needle))
  const by = sortKey.value ? props.sorts?.[sortKey.value] : undefined
  if (by) {
    const sign = sortDir.value === 'asc' ? 1 : -1
    out = [...out].sort((a, b) => {
      const x = by(a), y = by(b)
      // Une valeur absente va TOUJOURS en fin de liste, dans les deux sens.
      if (x == null || x === '') return (y == null || y === '') ? 0 : 1
      if (y == null || y === '') return -1
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign
      return String(x).localeCompare(String(y), 'fr', { numeric: true, sensitivity: 'base' }) * sign
    })
  }
  return out
})

const sort = computed<TableSort>(() => ({
  key: sortKey.value,
  dir: sortDir.value,
  toggle: (k: string) => {
    if (sortKey.value === k) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    else { sortKey.value = k; sortDir.value = 'asc' }
  },
}))

const { page, paged, total, pageSize } = usePager(() => view.value, props.pageSize)
</script>

<template>
  <div v-if="search" class="ct-bar">
    <input v-model="q" class="inp sm" type="search" :placeholder="searchPlaceholder || 'rechercher…'"
      :aria-label="searchPlaceholder || 'rechercher'" />
    <span v-if="q.trim()" class="ct-count">{{ view.length }} / {{ rows.length }}</span>
  </div>
  <table class="tbl">
    <thead><tr><slot name="head" :sort="sort" /></tr></thead>
    <tbody>
      <template v-for="(row, i) in paged" :key="i">
        <slot name="row" :row="row" :index="i" />
      </template>
      <tr v-if="busy"><td colspan="100" class="dim" style="text-align: center; padding: 16px">chargement…</td></tr>
      <tr v-else-if="loaded && !view.length">
        <td colspan="100" class="dim" style="text-align: center; padding: 16px">
          {{ q.trim() && rows.length ? `aucun résultat pour « ${q.trim()} »` : (empty || 'aucune donnée') }}
        </td>
      </tr>
    </tbody>
  </table>
  <Pager :total="total" :page="page" :page-size="pageSize" @update:page="page = $event" />
</template>

<style scoped>
.ct-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--color-hair-soft); }
.ct-bar .inp { width: 260px; max-width: 100%; }
.ct-count { font-size: 11.5px; color: var(--color-faint); }
</style>
