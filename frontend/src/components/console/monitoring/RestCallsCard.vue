<script setup lang="ts">
// Lentille REST (ADR 0017, kind='rest') : volume/erreurs/latence des requêtes /api/*
// par route. Présentationnel (rest par prop) → réutilisable à tous les niveaux.
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import MonitoringStats from './MonitoringStats.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import type { MonitoringRestStats } from '@/types/api'
import { fmtMs } from '@/lib/monitoring'

const props = defineProps<{
  rest: MonitoringRestStats | null
  windowDays: number
  loading?: boolean
}>()

const kpis = computed(() => {
  const r = props.rest
  return [
    { label: 'total requests', value: (r?.total_calls ?? 0).toLocaleString('en-US'), sub: `${props.windowDays}-day window` },
    { label: 'errors (≥400)', value: r?.error_count ?? 0, sub: '4xx + 5xx', tone: r?.error_count ? 'var(--color-terra-ink)' : undefined },
    { label: 'active users', value: r?.active_users ?? 0, sub: 'authenticated callers' },
  ]
})
</script>

<template>
  <div v-if="loading && !rest" class="grid3">
    <div v-for="i in 3" :key="i" class="sk" style="height: 74px" />
  </div>
  <template v-else>
    <MonitoringStats :items="kpis" />
    <ConsoleCard flush title="by route">
      <table class="tbl">
        <thead><tr><th>route</th><th class="num">calls</th><th class="num">errors</th><th class="num">avg</th><th class="num">p95</th></tr></thead>
        <tbody>
          <tr v-for="r in rest?.by_route ?? []" :key="r.route">
            <td><code class="mono">{{ r.route }}</code></td>
            <td class="num">{{ r.calls }}</td>
            <td class="num"><ErrLabel v-if="r.errors">{{ r.errors }}</ErrLabel><span v-else class="dim">0</span></td>
            <td class="num dim">{{ fmtMs(r.avg_ms) }}</td>
            <td class="num dim">{{ fmtMs(r.p95_ms) }}</td>
          </tr>
          <tr v-if="rest && !rest.by_route.length"><td colspan="5" class="dim" style="text-align: center; padding: 16px">no rest traffic in window.</td></tr>
        </tbody>
      </table>
    </ConsoleCard>
  </template>
</template>
