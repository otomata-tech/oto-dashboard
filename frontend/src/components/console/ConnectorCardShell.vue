<script setup lang="ts">
// Shell visuel COMMUN d'une carte connecteur (ADR 0024 §3) — partagé par la carte
// USER (`ConnectorCard`) et la carte ORG (`ConnectorOrgCard`) pour qu'elles aient la
// même identité visuelle. Porte le chrome (logo + nom + badges + en-tête droit) et le
// conteneur de corps ; chaque consommateur peint SON corps dans le slot par défaut.
import { computed } from 'vue'

const props = defineProps<{
  label: string
  logoUrl?: string | null
  subtitle?: string
  off?: boolean          // carte grisée (état « désactivé »)
  collapsed?: boolean    // masque le corps (ex. connecteur user non sélectionné)
}>()

const monogram = computed(() => (props.label || '?').charAt(0).toUpperCase())
</script>

<template>
  <article class="cc-card" :class="{ off }">
    <header class="cc-head">
      <div class="cc-logo">
        <img v-if="logoUrl" :src="logoUrl" :alt="label" loading="lazy" />
        <span v-else class="cc-mono">{{ monogram }}</span>
      </div>
      <div class="cc-id">
        <div class="cc-name">{{ label }}<slot name="badges" /></div>
        <div v-if="subtitle" class="cc-pub">{{ subtitle }}</div>
      </div>
      <slot name="header-right" />
    </header>
    <div v-if="!collapsed" class="cc-body"><slot /></div>
  </article>
</template>

<style scoped>
.cc-card { border: 1px solid var(--color-hair); border-radius: 12px; background: var(--color-paper); overflow: hidden; }
.cc-card.off { background: var(--color-surface); opacity: 0.78; }
.cc-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
.cc-logo {
  width: 36px; height: 36px; border-radius: 9px; flex: 0 0 auto; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-hair); background: var(--color-surface);
}
.cc-logo img { width: 100%; height: 100%; object-fit: contain; }
.cc-mono { font-family: var(--font-mono); font-weight: 700; font-size: 15px; color: var(--color-ink-soft); }
.cc-id { flex: 1; min-width: 0; }
.cc-name { font-weight: 600; font-size: 14px; line-height: 1.2; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cc-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-body { padding: 0 14px 14px; }
</style>
