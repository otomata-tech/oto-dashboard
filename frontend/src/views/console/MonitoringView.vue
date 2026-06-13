<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import DayBars from '@/components/console/DayBars.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import { getMonitoringSummary } from '@/api/console'
import type { MonitoringSummary } from '@/types/api'
import { toDayBars, fmtMs } from '@/lib/monitoring'
import { humanize } from '@/lib/errors'

const win = ref(7)
const summary = ref<MonitoringSummary | null>(null)
const error = ref<string | null>(null)

const errRate = computed(() => {
  const s = summary.value
  return s && s.total_calls ? Math.round((s.error_count / s.total_calls) * 100) : 0
})
const bars = computed(() => (summary.value ? toDayBars(summary.value.by_day, win.value) : []))

async function load() {
  try { summary.value = await getMonitoringSummary(win.value) }
  catch (e) { error.value = humanize(e) }
}
watch(win, load, { immediate: true })
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div style="display: flex; align-items: center; gap: 6px">
      <button v-for="w in [7, 30, 90]" :key="w" class="btn-mini"
        :style="win === w ? { background: 'var(--color-ink)', color: 'var(--color-bg)', borderColor: 'var(--color-ink)' } : undefined"
        @click="win = w">{{ w }} days</button>
      <span class="helptext" style="margin-left: 8px">unauthenticated stdio sessions show as anonymous.</span>
    </div>

    <div class="grid3">
      <Stat label="total calls" :value="(summary?.total_calls ?? 0).toLocaleString('en-US')" :sub="`${win}-day window`" />
      <Stat label="errors" :value="summary?.error_count ?? 0" :unit="errRate + '%'" :tone="summary?.error_count ? 'var(--color-terra-ink)' : undefined" sub="across all callers" />
      <Stat label="active users" :value="summary?.active_users ?? 0" sub="authenticated callers" />
    </div>

    <ConsoleCard :title="`volume · last ${bars.length} days`">
      <DayBars :days="bars" :height="96" />
    </ConsoleCard>

    <div class="grid2">
      <ConsoleCard flush title="by tool">
        <table class="tbl">
          <thead><tr><th>tool</th><th class="num">calls</th><th class="num">errors</th><th class="num">avg</th></tr></thead>
          <tbody>
            <tr v-for="t in summary?.by_tool ?? []" :key="t.tool_name">
              <td><code class="mono">{{ t.tool_name }}</code></td>
              <td class="num">{{ t.calls }}</td>
              <td class="num"><ErrLabel v-if="t.errors">{{ t.errors }}</ErrLabel><span v-else class="dim">0</span></td>
              <td class="num dim">{{ fmtMs(t.avg_ms) }}</td>
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
  </div>
</template>
