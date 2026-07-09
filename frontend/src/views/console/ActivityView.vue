<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import { defineAsyncComponent } from 'vue'
const CallsBarChart = defineAsyncComponent(() => import('@/components/console/CallsBarChart.vue'))
import CallLogCard from '@/components/console/monitoring/CallLogCard.vue'
import { getMyCalls } from '@/api/console'
import type { ToolCall } from '@/types/api'
import { humanize } from '@/lib/errors'

// Activité de l'utilisateur courant — endpoint per-user /api/me/calls, accessible à tout
// membre (≠ monitoring admin qui agrège tout le monde). Le journal réutilise la carte
// partagée `CallLogCard` (même table que /platform/monitoring et la fiche user admin).
const calls = ref<ToolCall[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

// Bucketise les appels en 14 jours [ok, err] pour <CallsBarChart>.
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
  try { calls.value = (await getMyCalls({ limit: 200, days: 14 })).calls }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
})
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard title="calls · last 14 days" sub="your tool calls across all clients. terra segments are failures.">
      <CallsBarChart :days="bars" :height="96" />
    </ConsoleCard>

    <CallLogCard :calls="calls" :loaded="loaded" filterable />
  </div>
</template>
