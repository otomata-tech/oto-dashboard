<script setup lang="ts">
// Sélecteur de fenêtre temporelle (7 / 30 / 90 jours) — segmented control réutilisable
// par toutes les surfaces de monitoring (plateforme, org, équipe, user). L'état est
// porté par le parent (souvent miroité `?win=`) : ce composant rend + émet, rien d'autre.
withDefaults(defineProps<{ modelValue: number; windows?: number[] }>(), {
  windows: () => [7, 30, 90],
})
defineEmits<{ (e: 'update:modelValue', win: number): void }>()
</script>

<template>
  <div class="seg" role="tablist" aria-label="fenêtre">
    <button v-for="w in windows" :key="w" type="button" role="tab"
      :class="{ on: w === modelValue }" :aria-selected="w === modelValue"
      @click="$emit('update:modelValue', w)">{{ w }} j</button>
  </div>
</template>
