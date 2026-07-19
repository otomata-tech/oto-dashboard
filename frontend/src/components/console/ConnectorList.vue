<script setup lang="ts" generic="T">
// Liste de connecteurs partagée (projections user/org/équipe) — coquille commune :
// une ConsoleCard dont les filtres (`SearchToggle`, dropdown « Type » par catégorie,
// `#controls` = dropdown « Statut » côté USER) vivent dans le slot `#actions` du
// header de carte — même ligne que le titre (`.card-head .actions`, `margin-left:auto`
// + gap uniforme), pas de rangée dédiée en plus. + table `.tbl` + le pipeline
// filtre/tri (« actifs d'abord ») + la sélection de ligne (`.crow.sel`,
// `v-model:selectedKey`). Générique sur T = le type métier brut de chaque surface
// (MyConnector / OrgConnectorActivation / ConnectorMeta) : les slots #head/#row reçoivent
// l'objet brut typé, chaque surface y rend SES colonnes/leviers propres via des accesseurs
// (fonctions pures capturant l'état réactif de la vue). Fin des 5 réécritures du pipeline.
import { computed, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import OtoSelect from './OtoSelect.vue'
import SearchToggle from './SearchToggle.vue'

const props = withDefaults(defineProps<{
  items: T[]                          // DÉJÀ pré-filtré par la lentille propre à la surface
  itemKey: (item: T) => string        // :key + identité de sélection
  label: (item: T) => string          // libellé — tie-break de tri (localeCompare)
  searchText: (item: T) => string     // haystack ; on lowercase needle + item
  category: (item: T) => string       // axe catégorie (chips + filtre)
  sortRank: (item: T) => number       // rang « actifs d'abord » ; plus petit = plus haut
  title?: string
  sub?: string
  flush?: boolean
  selectable?: boolean                // false = pas de clic/sel (équipe)
  selectedKey?: string | null         // sélection contrôlée (v-model:selectedKey)
  categoryValues?: string[]           // override des comptes de chips (user : catalogue complet)
  searchPlaceholder?: string
}>(), { flush: true, selectable: true })

const emit = defineEmits<{
  'update:selectedKey': [key: string | null]
  select: [item: T]
}>()

const q = ref('')
const category = ref('')

const chipValues = computed(() => props.categoryValues ?? props.items.map(props.category))
// Options du dropdown « Type » (remplace les chips catégorie) — même comptage/tri
// que l'ex-CategoryChips, masqué s'il n'y a rien à filtrer (≤1 catégorie distincte).
const categoryOptions = computed(() => {
  const counts = new Map<string, number>()
  for (const v of chipValues.value) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ value: name, label: `${name} (${n})` }))
})
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return props.items
    .filter((i) => !category.value || props.category(i) === category.value)
    .filter((i) => !needle || props.searchText(i).toLowerCase().includes(needle))
    .sort((a, b) => props.sortRank(a) - props.sortRank(b) || props.label(a).localeCompare(props.label(b)))
})

function onSelect(i: T) {
  if (!props.selectable) return
  emit('update:selectedKey', props.itemKey(i))
  emit('select', i)
}
</script>

<template>
  <ConsoleCard :title="title" :sub="sub" :flush="flush">
    <template #actions>
      <SearchToggle v-model="q" :placeholder="searchPlaceholder" />
      <OtoSelect v-if="categoryOptions.length > 1" v-model="category" :options="categoryOptions"
        none-label="tous les types" placeholder="Type" aria-label="Type" size="sm" />
      <slot name="controls" />
    </template>

    <slot name="beforeTable" />

    <table class="tbl">
      <thead><tr><slot name="head" /></tr></thead>
      <tbody>
        <tr v-for="item in shown" :key="itemKey(item)" class="crow"
          :class="{ sel: selectable && itemKey(item) === selectedKey }" @click="onSelect(item)">
          <slot name="row" :item="item" />
        </tr>
      </tbody>
    </table>

    <slot name="empty" v-if="!shown.length">
      <p class="helptext" style="text-align: center; padding: 18px">no connector matches your filters.</p>
    </slot>

    <slot name="footer" />
  </ConsoleCard>
</template>
