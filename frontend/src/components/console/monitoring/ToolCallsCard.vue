<script setup lang="ts">
// Lentille MCP (les invocations d'outils par l'agent) — KPIs + volume/jour + par outil
// + par appelant. Purement présentationnel (summary par prop) : réutilisable plateforme
// / org / équipe / user. `linkUsers` transforme les appelants en liens vers leur fiche
// admin (n'a de sens qu'aux niveaux qui listent plusieurs appelants).
import { computed, defineAsyncComponent } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import MonitoringStats from './MonitoringStats.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import type { MonitoringSummary } from '@/types/api'
import { toDayBars, fmtMs } from '@/lib/monitoring'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
const byTool = computed(() => props.summary?.by_tool ?? [])
const byUser = computed(() => props.summary?.by_user ?? [])
const kpis = computed(() => {
  const s = props.summary
  return [
    { label: t('monitoringUi.calls.total'), value: (s?.total_calls ?? 0).toLocaleString('fr-FR'), sub: t('monitoringUi.calls.window', { n: props.windowDays }) },
    { label: t('monitoringUi.calls.errors'), value: s?.error_count ?? 0, unit: errRate.value + '%', sub: t('monitoringUi.calls.allCallers'), tone: s?.error_count ? 'var(--color-terra-ink)' : undefined },
    { label: t('monitoringUi.calls.activeUsers'), value: s?.active_users ?? 0, sub: t('monitoringUi.calls.authCallers') },
  ]
})
</script>

<template>
  <div v-if="loading && !summary" class="grid3">
    <div v-for="i in 3" :key="i" class="sk" style="height: 74px" />
  </div>
  <template v-else>
    <MonitoringStats :items="kpis" />

    <ConsoleCard :title="t('monitoringUi.calls.volume', { n: bars.length })">
      <CallsBarChart :days="bars" :height="96" />
    </ConsoleCard>

    <div class="grid2">
      <ConsoleCard flush :title="t('monitoringUi.calls.byTool')">
        <ConsoleTable :rows="byTool" :loaded="!!summary" :empty="t('monitoringUi.calls.noCall')">
          <template #head>
            <th>{{ t('monitoringUi.calls.tool') }}</th><th class="num">{{ t('monitoringUi.calls.calls') }}</th><th class="num">{{ t('monitoringUi.calls.errors') }}</th><th class="num">{{ t('monitoringUi.calls.avg') }}</th><th class="num">{{ t('monitoringUi.calls.p95') }}</th>
          </template>
          <template #row="{ row: tool }">
            <tr>
              <td><code class="mono">{{ tool.tool_name }}</code></td>
              <td class="num">{{ tool.calls }}</td>
              <td class="num"><ErrLabel v-if="tool.errors">{{ tool.errors }}</ErrLabel><span v-else class="dim">0</span></td>
              <td class="num dim">{{ fmtMs(tool.avg_ms) }}</td>
              <td class="num dim">{{ fmtMs(tool.p95_ms ?? null) }}</td>
            </tr>
          </template>
        </ConsoleTable>
      </ConsoleCard>

      <ConsoleCard v-if="showUsers" flush :title="t('monitoringUi.calls.byCaller')">
        <ConsoleTable :rows="byUser" :loaded="!!summary" :empty="t('monitoringUi.calls.noCaller')">
          <template #head>
            <th>{{ t('monitoringUi.calls.caller') }}</th><th class="num">{{ t('monitoringUi.calls.calls') }}</th><th class="num">{{ t('monitoringUi.calls.errors') }}</th>
          </template>
          <template #row="{ row: u }">
            <tr>
              <td class="dim" style="color: var(--color-ink-soft)">
                <RouterLink v-if="linkUsers && u.sub" class="linklike" :to="`/platform/users/${u.sub}`">{{ u.email || u.name || u.sub }}</RouterLink>
                <span v-else>{{ u.email || u.name || t('monitoringUi.calls.anonymous') }}</span>
              </td>
              <td class="num">{{ u.calls }}</td>
              <td class="num"><ErrLabel v-if="u.errors">{{ u.errors }}</ErrLabel><span v-else class="dim">0</span></td>
            </tr>
          </template>
        </ConsoleTable>
      </ConsoleCard>
    </div>
  </template>
</template>
