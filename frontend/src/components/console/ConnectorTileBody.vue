<script setup lang="ts">
// Corps commun d'une TUILE de connecteur (dans le slot de ConnectorCardShell) —
// description + rang de badges canoniques + pied. Factorisé des grilles marketplace
// (ConnectorLibraryView) et partagés (ConnectorsSharedView), qui peignaient le même
// squelette avec deux jeux de classes distincts. Le chrome (logo/nom/éditeur/hover)
// reste dans ConnectorCardShell ; le PIED, propre à chaque surface, passe par le slot.
import ConnectorBadges from './ConnectorBadges.vue'
import type { ConnectorMeta } from '@/types/api'

withDefaults(defineProps<{
  description?: string | null
  meta?: ConnectorMeta | null
  clamp?: boolean          // marketplace : borne la description à 3 lignes
}>(), { clamp: false })
</script>

<template>
  <p class="ctb-desc" :class="{ clamp }">{{ description || '—' }}</p>
  <div class="ctb-tags"><ConnectorBadges :meta="meta" /></div>
  <div class="ctb-foot"><slot name="footer" /></div>
</template>

<style scoped>
.ctb-desc { font-size: 12.5px; line-height: 1.5; color: var(--color-ink-soft); margin: 0; flex: 1; }
.ctb-desc.clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ctb-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ctb-foot { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
</style>
