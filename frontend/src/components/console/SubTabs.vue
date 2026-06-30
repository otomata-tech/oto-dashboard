<script setup lang="ts">
// Barre d'onglets de sous-section (segmented control) — point d'entrée unique
// d'une page qui regroupe plusieurs surfaces (« mes connecteurs / partagés /
// marketplace »). L'onglet actif est porté par le parent (souvent câblé sur
// `?tab=` via useDeepLink) : ce composant ne fait que rendre + émettre.
export interface SubTab {
  key: string
  label: string
  hint?: string
}
defineProps<{ tabs: SubTab[]; modelValue: string }>()
defineEmits<{ (e: 'update:modelValue', key: string): void }>()
</script>

<template>
  <div class="subtabs" role="tablist">
    <button v-for="t in tabs" :key="t.key" type="button" role="tab"
      class="subtab" :class="{ on: t.key === modelValue }"
      :aria-selected="t.key === modelValue" :title="t.hint"
      @click="$emit('update:modelValue', t.key)">
      {{ t.label }}
    </button>
  </div>
</template>

<style scoped>
.subtabs {
  display: inline-flex; gap: 3px; padding: 3px;
  border: 1px solid var(--color-hair); border-radius: 11px;
  background: var(--color-surface); margin-bottom: 16px;
}
.subtab {
  font-size: 12.5px; font-weight: 600; text-transform: lowercase;
  padding: 5px 14px; border-radius: 8px; border: 1px solid transparent;
  background: transparent; color: var(--color-mute); cursor: pointer;
  transition: all var(--t-fast) var(--ease-out); white-space: nowrap;
}
.subtab:hover { color: var(--color-ink-soft); }
.subtab.on {
  background: var(--color-ink); color: var(--color-bg); border-color: var(--color-ink);
}
</style>
