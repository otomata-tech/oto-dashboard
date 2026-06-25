<script setup lang="ts">
// Filtre par catégorie — chips « all » + une par catégorie présente, triée par
// nombre décroissant. Partagé par les 4 surfaces connecteurs (bibliothèque +
// 3 projections de gouvernance USER/ORG/PLATEFORME, ADR 0022) pour faire vivre
// l'axe `category` curé du registre dans l'UI. Les comptes portent sur le jeu
// COMPLET passé (pas sur le résultat d'une recherche). Masqué s'il n'y a qu'une
// seule catégorie (rien à filtrer).
import { computed } from 'vue'

const props = defineProps<{ values: string[]; modelValue: string | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()

const cats = computed(() => {
  const counts = new Map<string, number>()
  for (const v of props.values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))
})
</script>

<template>
  <div v-if="cats.length > 1" class="chips">
    <button class="chip" :class="{ on: modelValue === null }" @click="emit('update:modelValue', null)">all</button>
    <button v-for="c in cats" :key="c.name" class="chip"
      :class="{ on: modelValue === c.name }" @click="emit('update:modelValue', c.name)">
      {{ c.name }} <span class="chip-n">{{ c.n }}</span>
    </button>
  </div>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 7px; }
.chip {
  font-size: 12px; padding: 4px 11px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--color-hair); background: var(--color-surface);
  color: var(--color-ink-soft); transition: all var(--t-fast) var(--ease-out);
}
.chip:hover { border-color: var(--color-ink-soft); }
.chip.on { background: var(--color-ink); color: var(--color-bg); border-color: var(--color-ink); }
.chip-n { opacity: 0.55; font-variant-numeric: tabular-nums; }
</style>
