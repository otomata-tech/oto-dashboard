<script setup lang="ts">
// Lentille REST (ADR 0017, kind='rest') : volume/erreurs/latence des requêtes /api/*
// par route. Présentationnel (rest par prop) → réutilisable à tous les niveaux.
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import MonitoringStats from './MonitoringStats.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import type { MonitoringRestStats } from '@/types/api'
import { fmtMs } from '@/lib/monitoring'

const props = defineProps<{
  rest: MonitoringRestStats | null
  windowDays: number
  loading?: boolean
}>()

const byRoute = computed(() => props.rest?.by_route ?? [])
const kpis = computed(() => {
  const r = props.rest
  return [
    { label: 'requêtes totales', value: (r?.total_calls ?? 0).toLocaleString('fr-FR'), sub: `fenêtre ${props.windowDays} j` },
    { label: 'erreurs (≥400)', value: r?.error_count ?? 0, sub: '4xx + 5xx', tone: r?.error_count ? 'var(--color-terra-ink)' : undefined },
    { label: 'utilisateurs actifs', value: r?.active_users ?? 0, sub: 'appelants authentifiés' },
  ]
})
</script>

<template>
  <div v-if="loading && !rest" class="grid3">
    <div v-for="i in 3" :key="i" class="sk" style="height: 74px" />
  </div>
  <template v-else>
    <MonitoringStats :items="kpis" />
    <ConsoleCard flush title="par route">
      <ConsoleTable :rows="byRoute" :loaded="!!rest" empty="aucun trafic rest dans la fenêtre.">
        <template #head>
          <th>route</th><th class="num">appels</th><th class="num">erreurs</th><th class="num">moy</th><th class="num">p95</th>
        </template>
        <template #row="{ row: r }">
          <tr>
            <td><code class="mono">{{ r.route }}</code></td>
            <td class="num">{{ r.calls }}</td>
            <td class="num"><ErrLabel v-if="r.errors">{{ r.errors }}</ErrLabel><span v-else class="dim">0</span></td>
            <td class="num dim">{{ fmtMs(r.avg_ms) }}</td>
            <td class="num dim">{{ fmtMs(r.p95_ms) }}</td>
          </tr>
        </template>
      </ConsoleTable>
    </ConsoleCard>
  </template>
</template>
