<script setup lang="ts" generic="T">
// Table console CLIENT-SIDE du design system — LE composant des tables admin/
// monitoring (listes chargées en un fetch). Il porte ce que chaque vue recopiait :
// chrome `.tbl`, états chargement/vide, pagination usePager intégrée (25/page).
//   <ConsoleTable :rows="items" :busy="busy" empty="aucun élément.">
//     <template #head><th>nom</th><th class="num">n</th></template>
//     <template #row="{ row }">
//       <tr>…</tr>
//       <tr v-if="expanded === row.id">…</tr>   <!-- drill-down : plusieurs <tr> ok -->
//     </template>
//   </ConsoleTable>
// Monter dans une ConsoleCard `flush`. Pendant server-driven : DataTable (tri/
// filtres côté API). Le colspan 100 des états couvre toute largeur (clampé par HTML).
import Pager from './Pager.vue'
import { usePager } from '@/composables/usePager'

const props = withDefaults(defineProps<{
  rows: T[]
  busy?: boolean
  /** false tant que le premier fetch n'a pas abouti (masque l'état vide). */
  loaded?: boolean
  empty?: string
  pageSize?: number
}>(), { loaded: true })

const { page, paged, total, pageSize } = usePager(() => props.rows, props.pageSize)
</script>

<template>
  <table class="tbl">
    <thead><tr><slot name="head" /></tr></thead>
    <tbody>
      <template v-for="(row, i) in paged" :key="i">
        <slot name="row" :row="row" :index="i" />
      </template>
      <tr v-if="busy"><td colspan="100" class="dim" style="text-align: center; padding: 16px">chargement…</td></tr>
      <tr v-else-if="loaded && !rows.length">
        <td colspan="100" class="dim" style="text-align: center; padding: 16px">{{ empty || 'aucune donnée' }}</td>
      </tr>
    </tbody>
  </table>
  <Pager :total="total" :page="page" :page-size="pageSize" @update:page="page = $event" />
</template>
