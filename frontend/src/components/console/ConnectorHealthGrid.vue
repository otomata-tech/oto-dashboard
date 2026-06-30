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
const sessions = ref<ConnectorMeta[]>([])

onMounted(async () => {
  try {
    const { connectors: c } = await getConnectors()
    // Deux familles : keyés/secret (ModeTag) et sessions navigateur (brevo/crunchbase,
    // personal_session) rendues à part — état dérivé de me.providers[name].
    connectors.value = c.filter((x) => !x.personal_session && x.secret_kind !== 'none')
    sessions.value = c.filter((x) => x.personal_session)
  } catch { /* le statut me suffit ; le grid se contente du catalogue dispo */ }
})

function sessionOn(name: string): boolean {
  return !!me.value?.providers?.[name]?.user_key_configured
}

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
      <RouterLink class="linklike" to="/connectors">manage →</RouterLink>
    </template>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px">
      <div v-for="c in connectors" :key="c.name" :style="cellStyle">
        <div style="display: flex; align-items: center; gap: 7px">
          <Dot :tone="connectorTone(c.name)" :size="7" />
          <span style="font-weight: 600; font-size: 12.5px">{{ c.label }}</span>
        </div>
        <ModeTag :mode="statusMode(c.name)" />
      </div>
      <div v-for="s in sessions" :key="s.name" :style="cellStyle">
        <div style="display: flex; align-items: center; gap: 7px">
          <Dot :tone="sessionOn(s.name) ? 'olive' : 'faint'" :size="7" />
          <span style="font-weight: 600; font-size: 12.5px">{{ s.label }}</span>
        </div>
        <Tag :tone="sessionOn(s.name) ? 'olive' : undefined">
          {{ sessionOn(s.name) ? 'session ok' : 'no session' }}
        </Tag>
      </div>
    </div>
  </ConsoleCard>
</template>
