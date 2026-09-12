<script setup lang="ts">
// Panneau OUTILS (scope USER) du drawer unifié — les outils du connecteur et leur état.
// LECTURE SEULE depuis oto#192 (12/09/2026) : masquer un outil a quitté le dashboard (aucun
// usage depuis le 06/08). Un outil « protected » est toujours actif ; quand l'exposition est
// « muted », tous restent masqués à l'agent jusqu'à ce que le connecteur repasse en actif
// (levier d'exposition, en tête du drawer).
import { computed } from 'vue'
import type { ToolsLever, ToolRow } from './adapter'
import type { MyConnector } from '@/types/api'

const props = defineProps<{ lever: ToolsLever<MyConnector>; row: MyConnector }>()
const tools = computed<ToolRow[]>(() => [...props.lever.list(props.row)].sort((a, b) => a.name.localeCompare(b.name)))
const enabledCount = computed(() => tools.value.filter((t) => t.enabled).length)
const isMuted = computed(() => props.row.state === 'paused')
</script>

<template>
  <div class="dr-block">
    <div class="eyebrow" style="margin-bottom: 6px">{{ enabledCount }} outils sur {{ tools.length }} activés</div>
    <p v-if="isMuted" class="helptext" style="color: var(--color-saffron-ink); margin: 0 0 8px">ce connecteur est en veille — ta sélection est conservée mais masquée à ton agent jusqu'à ce que tu le repasses en actif.</p>
    <div v-for="t in tools" :key="t.name" class="trow">
      <div style="min-width: 0; flex: 1">
        <code class="mono" style="font-size: 12px; color: var(--color-ink-soft)">{{ t.name }}</code>
        <div v-if="t.description" style="font-size: 11px; line-height: 1.45; color: var(--color-mute); margin-top: 2px">{{ t.description }}</div>
        <span v-if="t.protected" class="tag" style="font-size: 8.5px; padding: 1.5px 6px; margin-top: 5px">toujours actif</span>
      </div>
      <span v-if="!t.enabled && !t.protected" class="tag" style="font-size: 8.5px; padding: 1.5px 6px">masqué</span>
    </div>
    <p v-if="!tools.length" class="helptext">aucun outil chargé pour ce connecteur.</p>
  </div>
</template>

<style scoped>
.dr-block { padding: 18px 20px; }
.trow { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--color-hair-soft); }
.trow:last-child { border-bottom: 0; }
</style>
