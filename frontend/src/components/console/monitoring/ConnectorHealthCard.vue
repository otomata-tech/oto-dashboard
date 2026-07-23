<script setup lang="ts">
// Santé connecteurs (ADR 0017, kind='connector') : échecs de résolution de credential
// par provider (souvent un handshake OAuth jamais terminé). Présentationnel (conn par
// prop) → réutilisable à tous les niveaux.
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import MonitoringStats from './MonitoringStats.vue'
import Pager from '@/components/console/Pager.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import type { MonitoringConnectorStats } from '@/types/api'
import { usePager } from '@/composables/usePager'

const props = defineProps<{
  conn: MonitoringConnectorStats | null
  windowDays: number
  loading?: boolean
}>()

const shortTs = (s: string | null) => (s ? s.slice(0, 16) : '—')
const providers = usePager(() => props.conn?.by_provider ?? [])
const kpis = computed(() => {
  const c = props.conn
  return [
    { label: 'échecs de résolution', value: c?.total_failures ?? 0, sub: `fenêtre ${props.windowDays} j`, tone: c?.total_failures ? 'var(--color-terra-ink)' : undefined },
    { label: 'connecteurs en échec', value: c?.by_provider.length ?? 0, sub: 'providers distincts' },
  ]
})
</script>

<template>
  <div v-if="loading && !conn" class="grid3">
    <div v-for="i in 2" :key="i" class="sk" style="height: 74px" />
  </div>
  <template v-else>
    <MonitoringStats :items="kpis" />
    <ConsoleCard flush title="échecs de résolution de credential">
      <p class="helptext" style="padding: 0 14px 8px">un échec = un utilisateur a tenté un connecteur sans credential valide (bloqué — souvent un handshake oauth jamais terminé).</p>
      <table class="tbl">
        <thead><tr><th>connecteur</th><th class="num">échecs</th><th class="num">users</th><th class="num">dernier</th></tr></thead>
        <tbody>
          <tr v-for="p in providers.paged.value" :key="p.provider">
            <td><code class="mono">{{ p.provider }}</code></td>
            <td class="num"><ErrLabel>{{ p.failures }}</ErrLabel></td>
            <td class="num">{{ p.users_affected }}</td>
            <td class="num dim">{{ shortTs(p.last_at) }}</td>
          </tr>
          <tr v-if="conn && !conn.by_provider.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">aucun échec connecteur dans la fenêtre — tout va bien.</td></tr>
        </tbody>
      </table>
      <Pager :total="providers.total.value" :page="providers.page.value" :page-size="providers.pageSize" @update:page="providers.page.value = $event" />
    </ConsoleCard>
  </template>
</template>
