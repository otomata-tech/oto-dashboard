<script setup lang="ts">
// En-tête de colonne TRIABLE d'un ConsoleTable : un clic trie sur la colonne, un second
// clic inverse le sens. `k` = la clé déclarée dans `sorts` du tableau.
import Icon from './Icon.vue'
import type { TableSort } from './tableSort'

defineProps<{ k: string; sort: TableSort; num?: boolean }>()
</script>

<template>
  <th :class="{ num }" :aria-sort="sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'">
    <button type="button" class="sth" :class="{ on: sort.key === k }" @click="sort.toggle(k)">
      <slot />
      <Icon v-if="sort.key === k" name="chevron-down" :size="11"
        :style="{ transform: sort.dir === 'asc' ? 'rotate(180deg)' : 'none' }" />
    </button>
  </th>
</template>

<style scoped>
.sth { display: inline-flex; align-items: center; gap: 3px; font: inherit; color: inherit; background: none;
  border: 0; padding: 0; cursor: pointer; text-transform: inherit; letter-spacing: inherit; }
.sth:hover, .sth.on { color: var(--color-ink); }
</style>
