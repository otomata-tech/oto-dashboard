<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import { defineAsyncComponent } from 'vue'
const CallsBarChart = defineAsyncComponent(() => import('@/components/console/CallsBarChart.vue'))
import ErrLabel from '@/components/console/ErrLabel.vue'
import SubTabs from '@/components/console/SubTabs.vue'
import { getMonitoringSummary, getMonitoringRest, getMonitoringConnectors, getMonitoringFunnel } from '@/api/console'
import type { MonitoringSummary, MonitoringRestStats, MonitoringConnectorStats, ActivationFunnel } from '@/types/api'
import { toDayBars, fmtMs } from '@/lib/monitoring'
import { humanize } from '@/lib/errors'
import { useDeepLink } from '@/composables/useDeepLink'

const WINDOWS = [7, 30, 90]
const TABS = [
  { key: 'mcp', label: 'mcp tools', hint: 'tool invocations (the agent acting)' },
  { key: 'rest', label: 'rest api', hint: 'dashboard & API requests' },
  { key: 'connectors', label: 'connectors', hint: 'credential resolution failures' },
]
const win = ref(7)
const tab = ref('mcp')
const error = ref<string | null>(null)

const summary = ref<MonitoringSummary | null>(null)
const rest = ref<MonitoringRestStats | null>(null)
const conn = ref<MonitoringConnectorStats | null>(null)
const funnel = ref<ActivationFunnel | null>(null)

// Fenêtre `?win=` + onglet `?tab=` (liens partageables ; valeurs par défaut = param effacé).
const dlWin = useDeepLink('win', (w) => { if (w != null && WINDOWS.includes(w) && w !== win.value) win.value = w }, { parse: Number })
const wInit = dlWin.read(); if (wInit != null && WINDOWS.includes(wInit)) win.value = wInit
const dlTab = useDeepLink('tab', (t) => { if (t && TABS.some(x => x.key === t)) tab.value = t })
const tInit = dlTab.read(); if (tInit && TABS.some(x => x.key === tInit)) tab.value = tInit

const errRate = computed(() => {
  const s = summary.value
  return s && s.total_calls ? Math.round((s.error_count / s.total_calls) * 100) : 0
})
const bars = computed(() => (summary.value ? toDayBars(summary.value.by_day, win.value) : []))
const shortTs = (s: string | null) => (s ? s.slice(0, 16) : '—')

async function loadFunnel() {
  try { funnel.value = await getMonitoringFunnel(win.value) } catch (e) { error.value = humanize(e) }
}
async function loadTab() {
  try {
    if (tab.value === 'mcp') summary.value = await getMonitoringSummary(win.value)
    else if (tab.value === 'rest') rest.value = await getMonitoringRest(win.value)
    else if (tab.value === 'connectors') conn.value = await getMonitoringConnectors(win.value)
  } catch (e) { error.value = humanize(e) }
}

// Toute bascule de fenêtre invalide les caches (les chiffres dépendent de la fenêtre).
watch(win, (w) => {
  dlWin.set(w === 7 ? null : w)
  summary.value = null; rest.value = null; conn.value = null
  loadFunnel(); loadTab()
}, { immediate: true })
watch(tab, (t) => { dlTab.set(t === 'mcp' ? null : t); loadTab() })
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div style="display: flex; align-items: center; gap: 6px">
      <button v-for="w in WINDOWS" :key="w" class="btn-mini"
        :style="win === w ? { background: 'var(--color-ink)', color: 'var(--color-bg)', borderColor: 'var(--color-ink)' } : undefined"
        @click="win = w">{{ w }} days</button>
      <span class="helptext" style="margin-left: 8px">unauthenticated stdio sessions show as anonymous.</span>
    </div>

    <!-- Funnel d'activation : COMPTE ≠ USAGE. Toujours visible (santé du compte). -->
    <ConsoleCard title="activation funnel">
      <div class="grid3">
        <Stat label="accounts" :value="funnel?.total_accounts ?? 0" sub="total signed up" />
        <Stat label="active" :value="funnel?.active ?? 0" :sub="`invoked a tool · ${win}d`"
          :tone="funnel && funnel.active ? 'var(--color-olive-ink)' : undefined" />
        <Stat label="never active" :value="funnel?.never_active ?? 0" sub="0 tool calls ever"
          :tone="funnel && funnel.never_active ? 'var(--color-terra-ink)' : undefined" />
        <Stat label="idle (rest only)" :value="funnel?.rest_only ?? 0" sub="opened, never invoked" />
        <Stat label="blocked" :value="funnel?.blocked_by_connector ?? 0" :sub="`connector failures · ${win}d`"
          :tone="funnel && funnel.blocked_by_connector ? 'var(--color-terra-ink)' : undefined" />
      </div>
    </ConsoleCard>

    <SubTabs :tabs="TABS" v-model="tab" />

    <!-- ── MCP tools ── -->
    <template v-if="tab === 'mcp'">
      <div class="grid3">
        <Stat label="total calls" :value="(summary?.total_calls ?? 0).toLocaleString('en-US')" :sub="`${win}-day window`" />
        <Stat label="errors" :value="summary?.error_count ?? 0" :unit="errRate + '%'" :tone="summary?.error_count ? 'var(--color-terra-ink)' : undefined" sub="across all callers" />
        <Stat label="active users" :value="summary?.active_users ?? 0" sub="authenticated callers" />
      </div>
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
            </tbody>
          </table>
        </ConsoleCard>
        <ConsoleCard flush title="by user">
          <table class="tbl">
            <thead><tr><th>caller</th><th class="num">calls</th><th class="num">errors</th></tr></thead>
            <tbody>
              <tr v-for="(u, i) in summary?.by_user ?? []" :key="i">
                <td class="dim" style="color: var(--color-ink-soft)">{{ u.email || u.name || 'anonymous (stdio)' }}</td>
                <td class="num">{{ u.calls }}</td>
                <td class="num"><ErrLabel v-if="u.errors">{{ u.errors }}</ErrLabel><span v-else class="dim">0</span></td>
              </tr>
            </tbody>
          </table>
        </ConsoleCard>
      </div>
    </template>

    <!-- ── REST api ── -->
    <template v-else-if="tab === 'rest'">
      <div class="grid3">
        <Stat label="total requests" :value="(rest?.total_calls ?? 0).toLocaleString('en-US')" :sub="`${win}-day window`" />
        <Stat label="errors (≥400)" :value="rest?.error_count ?? 0" :tone="rest?.error_count ? 'var(--color-terra-ink)' : undefined" sub="4xx + 5xx" />
        <Stat label="active users" :value="rest?.active_users ?? 0" sub="authenticated callers" />
      </div>
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
            <tr v-if="rest && !rest.by_route.length"><td colspan="5" class="dim">no rest traffic in window.</td></tr>
          </tbody>
        </table>
      </ConsoleCard>
    </template>

    <!-- ── Connectors ── -->
    <template v-else-if="tab === 'connectors'">
      <div class="grid3">
        <Stat label="resolution failures" :value="conn?.total_failures ?? 0" :tone="conn?.total_failures ? 'var(--color-terra-ink)' : undefined" :sub="`${win}-day window`" />
        <Stat label="connectors failing" :value="conn?.by_provider.length ?? 0" sub="distinct providers" />
      </div>
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
            <tr v-if="conn && !conn.by_provider.length"><td colspan="4" class="dim">no connector failures in window — all good.</td></tr>
          </tbody>
        </table>
      </ConsoleCard>
    </template>
  </div>
</template>
