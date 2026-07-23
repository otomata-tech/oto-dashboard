import { computed, ref, watch } from 'vue'

// Pagination CLIENT-SIDE d'une liste déjà chargée — l'état derrière <Pager>.
// Usage :
//   const { page, paged, total } = usePager(() => filtered.value)
//   <tr v-for="x in paged" …> … <Pager v-model:page="page" :total="total" :page-size="25" />
// La page revient à 0 quand la liste change de référence (nouveau fetch, filtre).
// Pendant server-driven : DataTable (tri/filtres côté API), pas ce composable.
export const PAGER_SIZE = 25

export function usePager<T>(list: () => T[], pageSize: number = PAGER_SIZE) {
  const page = ref(0)
  const total = computed(() => list().length)
  const paged = computed(() => list().slice(page.value * pageSize, (page.value + 1) * pageSize))
  watch(list, () => { page.value = 0 })
  return { page, paged, total, pageSize }
}
