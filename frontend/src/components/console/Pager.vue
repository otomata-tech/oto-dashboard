<script setup lang="ts">
// Pagination CLIENT-SIDE du design system (b7) — pour les listes chargées en un
// fetch (tables admin) : le composant ne rend rien sous une page. Pendant server-
// driven : le pager intégré de DataTable (tri/filtres côté API). Usage :
//   const page = ref(0)
//   const paged = computed(() => rows.slice(page.value * SIZE, (page.value + 1) * SIZE))
//   <Pager v-model:page="page" :total="rows.length" :page-size="SIZE" />
// Le parent remet `page` à 0 quand son filtre change.
import { computed } from 'vue'
import Btn from './Btn.vue'

const props = defineProps<{
  total: number
  page: number       // 0-based
  pageSize: number
}>()
const emit = defineEmits<{ (e: 'update:page', page: number): void }>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const rangeLabel = computed(() => {
  const from = props.page * props.pageSize + 1
  const to = Math.min(props.total, (props.page + 1) * props.pageSize)
  return `${from}–${to} / ${props.total}`
})
</script>

<template>
  <div v-if="pageCount > 1" class="pager">
    <span class="dim" style="font-size: 12px">{{ rangeLabel }}</span>
    <span style="flex: 1"></span>
    <Btn kind="mini" :disabled="page <= 0" @click="emit('update:page', page - 1)">‹ Préc.</Btn>
    <span class="dim" style="font-size: 12px">page {{ page + 1 }} / {{ pageCount }}</span>
    <Btn kind="mini" :disabled="page >= pageCount - 1" @click="emit('update:page', page + 1)">Suiv. ›</Btn>
  </div>
</template>

<style scoped>
.pager {
  display: flex; align-items: center; gap: 10px;
  padding: 8px var(--pad-card);
  border-top: 1px solid var(--color-hair-soft);
}
</style>
