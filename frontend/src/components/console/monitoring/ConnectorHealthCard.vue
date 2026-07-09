<script setup lang="ts">
// Santé connecteurs (ADR 0017, kind='connector') : échecs de résolution de credential
// par provider (souvent un handshake OAuth jamais terminé). Présentationnel (conn par
// prop) → réutilisable à tous les niveaux.
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import MonitoringStats from './MonitoringStats.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import type { MonitoringConnectorStats } from '@/types/api'

const props = defineProps<{
  conn: MonitoringConnectorStats | null
  windowDays: number
  loading?: boolean
}>()

const shortTs = (s: string | null) => (s ? s.slice(0, 16) : '—')
const kpis = computed(() => {
  const c = props.conn
  return [
    { label: 'resolution failures', value: c?.total_failures ?? 0, sub: `${props.windowDays}-day window`, tone: c?.total_failures ? 'var(--color-terra-ink)' : undefined },
    { label: 'connectors failing', value: c?.by_provider.length ?? 0, sub: 'distinct providers' },
  ]
})
</script>

<template>
  <div v-if="loading && !conn" class="grid3">
    <div v-for="i in 2" :key="i" class="sk" style="height: 74px" />
  </div>
  <template v-else>
    <MonitoringStats :items="kpis" />
    <ConsoleCard flush title="credential resolution failures">
      <p class="helptext" style="padding: 0 14px 8px">a failure = a user tried to use a connector with no valid credential (blocked, often a never-finished oauth handshake).</p>
      <table class="tbl">
        <thead><tr><th>connector</th><th class="num">failures</th><th class="num">users</th><th class="num">last</th></tr></thead>
        <tbody>
          <tr v-for="p in conn?.by_provider ?? []" :key="p.provider">
            <td><code class="mono">{{ p.provider }}</code></td>
            <td class="num"><ErrLabel>{{ p.failures }}</ErrLabel></td>
            <td class="num">{{ p.users_affected }}</td>
            <td class="num dim">{{ shortTs(p.last_at) }}</td>
          </tr>
          <tr v-if="conn && !conn.by_provider.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no connector failures in window — all good.</td></tr>
        </tbody>
      </table>
    </ConsoleCard>
  </template>
</template>
