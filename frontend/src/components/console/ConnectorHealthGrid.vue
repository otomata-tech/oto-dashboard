<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from './ConsoleCard.vue'
import Dot from './Dot.vue'
import Tag from './Tag.vue'
import ModeTag from './ModeTag.vue'
import { getConnectors } from '@/api/console'
import { useMe } from '@/composables/useMe'
import type { ConnectorMeta, ConnectorMode, DotTone } from '@/lib/consoleTypes'

const { me } = useMe()
const connectors = ref<ConnectorMeta[]>([])

onMounted(async () => {
  try {
    const { connectors: c } = await getConnectors()
    // Le grid n'affiche que les connecteurs à clé/secret (les sessions perso
    // sont rendues à part depuis me.linkedin / me.crunchbase).
    connectors.value = c.filter((x) => !x.personal_session && x.secret_kind !== 'none')
  } catch { /* le statut me suffit ; le grid se contente du catalogue dispo */ }
})

function statusMode(name: string): ConnectorMode {
  const p = me.value?.providers?.[name]
  if (!p) return 'none'
  if (p.mode === 'forbidden') return 'none'
  if (p.mode === 'over_quota') return 'platform'
  return p.mode as ConnectorMode
}
function connectorTone(name: string): DotTone {
  const p = me.value?.providers?.[name]
  if (!p || p.mode === 'forbidden') return 'faint'
  if (p.mode === 'over_quota') return 'terra'
  if (p.quota_daily && p.quota_used_today / p.quota_daily >= 0.75) return 'saffron'
  return 'olive'
}
const cellStyle = 'border: 1px solid var(--color-hair); border-radius: 9px; padding: 9px 11px; display: flex; flex-direction: column; gap: 5px'
</script>

<template>
  <ConsoleCard
    title="connector health"
    sub="api keys and per-user sessions your tools depend on."
  >
    <template #actions>
      <RouterLink class="linklike" to="/console/connectors">manage →</RouterLink>
    </template>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px">
      <div v-for="c in connectors" :key="c.name" :style="cellStyle">
        <div style="display: flex; align-items: center; gap: 7px">
          <Dot :tone="connectorTone(c.name)" :size="7" />
          <span style="font-weight: 600; font-size: 12.5px">{{ c.label }}</span>
        </div>
        <ModeTag :mode="statusMode(c.name)" />
      </div>
      <div :style="cellStyle">
        <div style="display: flex; align-items: center; gap: 7px">
          <Dot :tone="me?.linkedin.configured ? 'olive' : 'faint'" :size="7" />
          <span style="font-weight: 600; font-size: 12.5px">linkedin</span>
        </div>
        <Tag :tone="me?.linkedin.configured ? 'olive' : undefined">
          {{ me?.linkedin.configured ? 'session ok' : 'no session' }}
        </Tag>
      </div>
      <div :style="cellStyle">
        <div style="display: flex; align-items: center; gap: 7px">
          <Dot :tone="me?.crunchbase.configured ? 'olive' : 'faint'" :size="7" />
          <span style="font-weight: 600; font-size: 12.5px">crunchbase</span>
        </div>
        <Tag :tone="me?.crunchbase.configured ? 'olive' : undefined">
          {{ me?.crunchbase.configured ? 'session ok' : 'no session' }}
        </Tag>
      </div>
    </div>
  </ConsoleCard>
</template>
