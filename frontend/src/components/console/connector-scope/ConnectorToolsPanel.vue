<script setup lang="ts">
// Panneau OUTILS (scope USER) du drawer unifié — toggles de visibilité par outil.
// Extrait verbatim de l'ex-`ConnectorDrawer`. Un outil « protected » est toujours actif ;
// quand l'exposition est « muted », les toggles sont visibles mais l'outil reste masqué.
import { computed } from 'vue'
import Toggle from '@/components/console/Toggle.vue'
import type { ToolsLever, ToolRow } from './adapter'
import type { MyConnector } from '@/types/api'

const props = defineProps<{ lever: ToolsLever<MyConnector>; row: MyConnector }>()
const tools = computed<ToolRow[]>(() => [...props.lever.list(props.row)].sort((a, b) => a.name.localeCompare(b.name)))
const enabledCount = computed(() => tools.value.filter((t) => t.enabled).length)
const isLive = computed(() => props.row.state === 'active')
const isMuted = computed(() => props.row.state === 'paused')
</script>

<template>
  <div class="dr-block">
    <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px">
      <div class="eyebrow">{{ enabledCount }} of {{ tools.length }} tools enabled</div>
      <div style="display: flex; gap: 12px">
        <button class="linklike" @click="lever.setAll(row, true)">Enable all</button>
        <button class="linklike" @click="lever.setAll(row, false)">Disable all</button>
      </div>
    </div>
    <p v-if="isMuted" class="helptext" style="color: var(--color-saffron-ink); margin: 0 0 8px">this connector is muted — your selection is saved but hidden from agents until you set it live.</p>
    <div v-for="t in tools" :key="t.name" class="trow">
      <div style="min-width: 0; flex: 1">
        <code class="mono" style="font-size: 12px; color: var(--color-ink-soft)">{{ t.name }}</code>
        <div v-if="t.description" style="font-size: 11px; line-height: 1.45; color: var(--color-mute); margin-top: 2px">{{ t.description }}</div>
        <span v-if="t.protected" class="tag" style="font-size: 8.5px; padding: 1.5px 6px; margin-top: 5px">always on</span>
      </div>
      <Toggle :on="t.enabled && isLive" :disabled="t.protected" @change="lever.toggle(t)" />
    </div>
    <p v-if="!tools.length" class="helptext">no tools loaded for this connector.</p>
  </div>
</template>

<style scoped>
.dr-block { padding: 18px 20px; }
.trow { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--color-hair-soft); }
.trow:last-child { border-bottom: 0; }
</style>
