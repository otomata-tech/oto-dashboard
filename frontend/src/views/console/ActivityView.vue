<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import DayBars from '@/components/console/DayBars.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import { getMonitoringCalls } from '@/api/console'
import { useMe } from '@/composables/useMe'
import type { ToolCall } from '@/types/api'
import { fmtMs } from '@/lib/monitoring'

// La seule source d'historique d'appels est le monitoring (réservé admin).
// On le scope au sub du user pour montrer SON activité ; un membre non-admin
// reçoit 403 → on l'affiche franchement (pas d'endpoint per-user à ce jour).
const { me } = useMe()
const calls = ref<ToolCall[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)
const isAdmin = computed(() => me.value?.role === 'admin')

type Filter = 'all' | 'ok' | 'errors'
const filter = ref<Filter>('all')
const filtered = computed(() =>
  calls.value.filter((c) => filter.value === 'all' || (filter.value === 'errors' ? !c.ok : c.ok)),
)

// Bucketise les appels en 14 jours [ok, err] pour <DayBars>.
const bars = computed<[number, number][]>(() => {
  const days: [number, number][] = Array.from({ length: 14 }, () => [0, 0])
  const now = Date.now()
  for (const c of calls.value) {
    const t = new Date(c.called_at.replace(' ', 'T') + 'Z').getTime()
    const idx = 13 - Math.floor((now - t) / 86_400_000)
    if (idx >= 0 && idx < 14) {
      if (c.ok) days[idx]![0]++
      else days[idx]![1]++
    }
  }
  return days
})

onMounted(async () => {
  try { calls.value = (await getMonitoringCalls({ sub: me.value?.sub, limit: 200, days: 14 })).calls }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loaded.value = true }
})
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard v-if="error && !isAdmin" title="activity log">
      <div class="helptext">
        a detailed per-call log isn't exposed on your account yet — it's available to platform admins
        under <strong>monitoring</strong>. your tool calls still run normally.
      </div>
    </ConsoleCard>

    <template v-else>
      <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

      <ConsoleCard title="calls · last 14 days" sub="your tool calls across all clients. terra segments are failures.">
        <DayBars :days="bars" :height="96" />
      </ConsoleCard>

      <ConsoleCard flush title="call log">
        <template #actions>
          <div style="display: flex; gap: 6px">
            <button v-for="f in (['all', 'ok', 'errors'] as Filter[])" :key="f" class="btn-mini"
              :style="filter === f ? { background: 'var(--color-hair-soft)', color: 'var(--color-ink)' } : undefined"
              @click="filter = f">{{ f }}</button>
          </div>
        </template>
        <table class="tbl">
          <thead><tr><th style="width: 18px"></th><th>tool</th><th>caller</th><th>detail</th><th class="num">duration</th><th class="num">at</th></tr></thead>
          <tbody>
            <tr v-for="c in filtered" :key="c.id">
              <td><Dot :tone="c.ok ? 'olive' : 'terra'" :size="7" /></td>
              <td><code class="mono">{{ c.tool_name }}</code></td>
              <td class="dim">{{ c.email || c.name || 'anonymous (stdio)' }}</td>
              <td><ErrLabel v-if="c.error">{{ c.error }}</ErrLabel><span v-else class="dim">ok</span></td>
              <td class="num dim">{{ fmtMs(c.duration_ms) }}</td>
              <td class="num dim">{{ new Date(c.called_at.replace(' ', 'T') + 'Z').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }}</td>
            </tr>
            <tr v-if="loaded && !filtered.length"><td colspan="6" class="dim" style="text-align: center; padding: 16px">no calls in this window</td></tr>
          </tbody>
        </table>
      </ConsoleCard>
    </template>
  </div>
</template>
