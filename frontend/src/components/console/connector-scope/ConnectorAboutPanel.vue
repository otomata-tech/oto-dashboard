<script setup lang="ts">
// Onglet « à propos » du drawer unifié : badges canoniques + description curée.
import type { ConnectorMeta } from '@/types/api'
import ConnectorBadges from '@/components/console/ConnectorBadges.vue'

defineProps<{ meta?: ConnectorMeta }>()
</script>

<template>
  <section class="cap">
    <ConnectorBadges :meta="meta" />
    <p v-if="meta?.description" class="cap-desc">{{ meta.description }}</p>
    <p v-else-if="meta?.help" class="cap-desc">{{ meta.help }}</p>
    <p v-if="meta?.namespaces?.length" class="cap-ns">
      <span class="cap-ns-lbl">outils</span> {{ meta.namespaces.join(' · ') }}
    </p>
  </section>
</template>

<style scoped>
.cap { padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.cap-desc { font-size: 12.5px; color: var(--color-mute); line-height: 1.5; }
.cap-ns { font-size: 11.5px; color: var(--color-faint); }
.cap-ns-lbl { text-transform: uppercase; letter-spacing: .04em; margin-right: 6px; }
</style>
