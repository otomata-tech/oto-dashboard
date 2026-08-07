<script setup lang="ts">
// Barre d'outils de la VUE FICHES d'un tableau du datastore. La vue fiches est le
// défaut d'un namespace typé, et elle n'offrait NI recherche NI tri NI filtre — un
// pager seul : dès qu'un vivier dépassait une page, retrouver « ce qui a bougé cette
// semaine » supposait de repasser en vue table. Mêmes verbes SERVEUR que `DataTable`
// (le parent fetch), donc l'état est partagé entre les deux vues : ce qu'on filtre
// ici reste filtré là-bas, et l'URL (`?q/sort/dir/f`) le porte pareil.
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import OtoSelect from './OtoSelect.vue'
import ColumnFilterCell from './ColumnFilterCell.vue'
import FilterChips from './FilterChips.vue'
import type { ColumnFilter, DatastoreSchema } from '@/types/api'
import {
  buildFilters, defaultOp, filterChipLabel, columnFilterKind, metaFieldLabel,
  META_DATE_FIELDS, type ColFilterState,
} from '@/lib/datastoreFilters'

const props = defineProps<{
  search: string
  sortField: string | null
  sortDir: 'asc' | 'desc'
  filters: ColumnFilter[]
  schema?: DatastoreSchema | null
}>()
const emit = defineEmits<{
  (e: 'update:search', q: string): void
  (e: 'update:sort', field: string, dir: 'asc' | 'desc'): void
  (e: 'update:filters', filters: ColumnFilter[]): void
}>()

const DATE_FILTER_FIELD = '_updated_at'

// Tri : les champs déclarés au schéma (c'est une vue de namespace TYPÉ) + les deux
// dates système. Un champ `hidden` reste triable — il est masqué à l'affichage, pas
// dépourvu de sens.
const sortOptions = computed(() => [
  ...(props.schema?.fields ?? [])
    .filter((f) => f.key)
    .map((f) => ({ value: f.key, label: f.label || f.key })),
  ...META_DATE_FIELDS.map((f) => ({ value: f, label: metaFieldLabel(f) })),
])
const currentSort = computed(() => props.sortField ?? DATE_FILTER_FIELD)
function onSortField(field: string) { emit('update:sort', field, props.sortDir) }
function toggleDir() {
  emit('update:sort', currentSort.value, props.sortDir === 'desc' ? 'asc' : 'desc')
}
const dirTitle = computed(() =>
  props.sortDir === 'desc' ? 'décroissant — cliquer pour croissant' : 'croissant — cliquer pour décroissant')

// Recherche : local + debounce (mêmes 300 ms que la vue table).
const searchLocal = ref(props.search)
let timer: ReturnType<typeof setTimeout> | null = null
watch(() => props.search, (v) => { searchLocal.value = v })
watch(searchLocal, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('update:search', v), 300)
})

// Filtre « modifié le » — le seul rendu ici (les autres colonnes se filtrent en vue
// table, à leur en-tête) : c'est celui qui n'a pas de colonne où vivre en fiches.
const dateState = ref<ColFilterState>({ op: defaultOp('timestamp'), value: '' })
watch(() => props.filters, (f) => {
  const cur = f.find((x) => x.field === DATE_FILTER_FIELD)
  dateState.value = cur
    ? { op: cur.op, value: Array.isArray(cur.value) ? cur.value.join(',') : cur.value }
    : { op: defaultOp('timestamp'), value: '' }
}, { immediate: true })

let ftimer: ReturnType<typeof setTimeout> | null = null
function onDateFilter(v: ColFilterState) {
  dateState.value = v
  if (ftimer) clearTimeout(ftimer)
  ftimer = setTimeout(() => {
    const rest = props.filters.filter((x) => x.field !== DATE_FILTER_FIELD)
    emit('update:filters', [...rest, ...buildFilters({ [DATE_FILTER_FIELD]: v })])
  }, 300)
}

// Chips : TOUS les filtres actifs, y compris ceux posés en vue table — sinon la vue
// fiches montrerait un sous-ensemble sans dire pourquoi.
const declaredOf = (field: string) => (props.schema?.fields ?? []).find((f) => f.key === field)
const labelOf = (field: string) => declaredOf(field)?.label || metaFieldLabel(field)
const chips = computed(() => props.filters.map((f) => ({
  field: f.field,
  // Type DÉCLARÉ : la vue fiches n'a pas de colonne d'où renifler les valeurs, mais
  // le namespace est typé — la chip doit dire « à partir du », pas « ≥ ».
  label: filterChipLabel(f, columnFilterKind([], f.field, declaredOf(f.field)?.type), labelOf(f.field)),
})))
function removeChip(field: string) {
  emit('update:filters', props.filters.filter((f) => f.field !== field))
}
</script>

<template>
  <div class="dsb">
    <div class="dsb-row">
      <div class="dsb-search">
        <Icon name="search" :size="14" />
        <input v-model="searchLocal" class="dsb-search-input" placeholder="rechercher…"
          @keydown.esc="searchLocal = ''" />
      </div>

      <label class="dsb-ctl">
        <span class="dsb-lbl">trier par</span>
        <OtoSelect :model-value="currentSort" size="sm" :options="sortOptions"
          aria-label="champ de tri" @update:model-value="onSortField" />
        <button class="dsb-dir" :title="dirTitle" @click="toggleDir">
          {{ sortDir === 'desc' ? '↓' : '↑' }}
        </button>
      </label>

      <label class="dsb-ctl">
        <span class="dsb-lbl">{{ metaFieldLabel('_updated_at') }}</span>
        <ColumnFilterCell :field="'_updated_at'" kind="timestamp" :model-value="dateState"
          @update:model-value="onDateFilter" />
      </label>
    </div>

    <FilterChips :chips="chips" @remove="removeChip" />
  </div>
</template>

<style scoped>
.dsb {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px var(--pad-card);
  border-bottom: 1px solid var(--color-hair-soft);
}
.dsb-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.dsb-search { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 160px; color: var(--color-mute); }
.dsb-search-input {
  flex: 1; font: inherit; font-size: 12.5px; border: 0; background: none;
  color: var(--color-ink); outline: none;
}
.dsb-ctl { display: inline-flex; align-items: center; gap: 6px; }
.dsb-lbl { font-size: 11px; color: var(--color-mute); white-space: nowrap; }
.dsb-dir {
  font: inherit; font-size: 12px; line-height: 1; cursor: pointer;
  border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  background: var(--color-surface); color: var(--color-mute); padding: 4px 7px;
}
.dsb-dir:hover { color: var(--color-ink); border-color: var(--color-cobalt); }
@media (max-width: 640px) {
  .dsb-row { gap: 8px; }
  .dsb-search { flex-basis: 100%; }
}
</style>
