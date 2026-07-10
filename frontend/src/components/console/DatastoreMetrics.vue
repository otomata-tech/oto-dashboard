<script setup lang="ts">
// Tuiles d'agrégats du cockpit datastore (ADR 0046) : total / moyenne des champs
// role="metric", calculés SERVEUR (aggregate) sur le jeu FILTRÉ affiché — mêmes
// q/filters que la table, jamais un cumul client de la page courante.
defineProps<{ tiles: Array<{ key: string; label: string; value: string; sub?: string }> }>()
</script>

<template>
  <div class="dsm">
    <div v-for="t in tiles" :key="t.key" class="dsm-tile">
      <span class="dsm-v">{{ t.value }}</span>
      <span class="dsm-l">{{ t.label }}</span>
      <span v-if="t.sub" class="dsm-s">{{ t.sub }}</span>
    </div>
  </div>
</template>

<style scoped>
.dsm { display: flex; flex-wrap: wrap; gap: 20px; padding: 10px 16px; border-bottom: 1px solid var(--color-hair-soft); }
.dsm-tile { display: flex; flex-direction: column; }
.dsm-v { font-size: 18px; font-weight: 700; color: var(--color-ink); line-height: 1.15; font-variant-numeric: tabular-nums; }
.dsm-l { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint); font-weight: 700; }
.dsm-s { font-size: 10.5px; color: var(--color-mute); }
</style>
