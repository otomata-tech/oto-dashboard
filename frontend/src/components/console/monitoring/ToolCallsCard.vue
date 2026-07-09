<script setup lang="ts">
// Lentille MCP (les invocations d'outils par l'agent) — KPIs + volume/jour + par outil
// + par appelant. Purement présentationnel (summary par prop) : réutilisable plateforme
// / org / équipe / user. `linkUsers` transforme les appelants en liens vers leur fiche
// admin (n'a de sens qu'aux niveaux qui listent plusieurs appelants).
import { computed, defineAsyncComponent } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import MonitoringStats from './MonitoringStats.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import type { MonitoringSummary } from '@/types/api'
import { toDayBars, fmtMs } from '@/lib/monitoring'

const CallsBarChart = defineAsyncComponent(() => import('@/components/console/CallsBarChart.vue'))

const props = withDefaults(defineProps<{
  summary: MonitoringSummary | null
  windowDays: number
  loading?: boolean
  linkUsers?: boolean
  showUsers?: boolean
}>(), { linkUsers: false, showUsers: true })

const errRate = computed(() => {
  const s = props.summary
  return s && s.total_calls ? Math.round((s.error_count / s.total_calls) * 100) : 0
})
const bars = computed(() => (props.summary ? toDayBars(props.summary.by_day, props.windowDays) : []))
const kpis = computed(() => {
  const s = props.summary
  return [
    { label: 'total calls', value: (s?.total_calls ?? 0).toLocaleString('en-US'), sub: `${props.windowDays}-day window` },
    { label: 'errors', value: s?.error_count ?? 0, unit: errRate.value + '%', sub: 'across all callers', tone: s?.error_count ? 'var(--color-terra-ink)' : undefined },
    { label: 'active users', value: s?.active_users ?? 0, sub: 'authenticated callers' },
  ]
})
</script>

<template>
  <div v-if="loading && !summary" class="grid3">
    <div v-for="i in 3" :key="i" class="sk" style="height: 74px" />
  </div>
  <template v-else>
    <MonitoringStats :items="kpis" />

    <ConsoleCard :title="`volume · last ${bars.length} days`">
      <CallsBarChart :days="bars" :height="96" />
    </ConsoleCard>

    <div class="grid2">
      <ConsoleCard flush title="by tool">
        <table class="tbl">
          <thead><tr><th>tool</th><th class="num">calls</th><th class="num">errors</th><th class="num">avg</th><th class="num">p95</th></tr></thead>
          <tbody>
            <tr v-for="t in summary?.by_tool ?? []" :key="t.tool_name">
              <td><code class="mono">{{ t.tool_name }}</code></td>
              <td class="num">{{ t.calls }}</td>
              <td class="num"><ErrLabel v-if="t.errors">{{ t.errors }}</ErrLabel><span v-else class="dim">0</span></td>
              <td class="num dim">{{ fmtMs(t.avg_ms) }}</td>
              <td class="num dim">{{ fmtMs(t.p95_ms ?? null) }}</td>
            </tr>
            <tr v-if="summary && !summary.by_tool.length"><td colspan="5" class="dim" style="text-align: center; padding: 16px">no tool calls in window.</td></tr>
          </tbody>
        </table>
      </ConsoleCard>

      <ConsoleCard v-if="showUsers" flush title="by caller">
        <table class="tbl">
          <thead><tr><th>caller</th><th class="num">calls</th><th class="num">errors</th></tr></thead>
          <tbody>
            <tr v-for="(u, i) in summary?.by_user ?? []" :key="i">
              <td class="dim" style="color: var(--color-ink-soft)">
                <RouterLink v-if="linkUsers && u.sub" class="linklike" :to="`/platform/users/${u.sub}`">{{ u.email || u.name || u.sub }}</RouterLink>
                <span v-else>{{ u.email || u.name || 'anonymous (stdio)' }}</span>
              </td>
              <td class="num">{{ u.calls }}</td>
              <td class="num"><ErrLabel v-if="u.errors">{{ u.errors }}</ErrLabel><span v-else class="dim">0</span></td>
            </tr>
            <tr v-if="summary && !summary.by_user.length"><td colspan="3" class="dim" style="text-align: center; padding: 16px">no callers in window.</td></tr>
          </tbody>
        </table>
      </ConsoleCard>
    </div>
  </template>
</template>
