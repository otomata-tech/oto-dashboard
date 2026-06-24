<script setup lang="ts">
// Liste éditable générique : une row d'ajout (slot #add, câblée par le caller) +
// N lignes (slot scopé #row={item,index,remove}) + état vide. Réutilise .rowlist/
// .rowitem de console.css. N'impose PAS la forme de l'item — le caller rend chaque
// ligne. Extrait du pattern .sh-list/.sh-item de ShareDialog.
defineProps<{
  items: unknown[]
  emptyText: string
}>()

const emit = defineEmits<{ remove: [index: number] }>()
</script>

<template>
  <div class="cfg-coll">
    <div v-if="$slots.add" class="cfg-coll-add"><slot name="add" /></div>
    <div v-if="items.length" class="rowlist">
      <div v-for="(item, index) in items" :key="index" class="rowitem">
        <slot name="row" :item="item" :index="index" :remove="() => emit('remove', index)" />
      </div>
    </div>
    <p v-else class="cfg-coll-empty">{{ emptyText }}</p>
  </div>
</template>

<style scoped>
.cfg-coll { display: flex; flex-direction: column; gap: 10px; }
.cfg-coll-add { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.cfg-coll-empty { font-size: 11.5px; color: var(--color-faint); padding: 6px 0; }
</style>
