<script setup lang="ts">
// Santé connecteurs (ADR 0017, kind='connector') : échecs de résolution de credential
// par provider (souvent un handshake OAuth jamais terminé). Présentationnel (conn par
// prop) → réutilisable à tous les niveaux.
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import MonitoringStats from './MonitoringStats.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import type { MonitoringConnectorStats } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  conn: MonitoringConnectorStats | null
  windowDays: number
  loading?: boolean
}>()

const shortTs = (s: string | null) => (s ? s.slice(0, 16) : '—')
const byProvider = computed(() => props.conn?.by_provider ?? [])
const kpis = computed(() => {
  const c = props.conn
  return [
    { label: t('monitoringUi.health.failures'), value: c?.total_failures ?? 0, sub: t('monitoringUi.health.window', { n: props.windowDays }), tone: c?.total_failures ? 'var(--color-terra-ink)' : undefined },
    { label: t('monitoringUi.health.failing'), value: c?.by_provider.length ?? 0, sub: t('monitoringUi.health.distinct') },
  ]
})
</script>

<template>
  <div v-if="loading && !conn" class="grid3">
    <div v-for="i in 2" :key="i" class="sk" style="height: 74px" />
  </div>
  <template v-else>
    <MonitoringStats :items="kpis" />
    <ConsoleCard flush :title="t('monitoringUi.health.title')">
      <p class="helptext" style="padding: 0 14px 8px">{{ t('monitoringUi.health.help') }}</p>
      <ConsoleTable :rows="byProvider" :loaded="!!conn" :empty="t('monitoringUi.health.empty')">
        <template #head>
          <th>{{ t('monitoringUi.health.connector') }}</th><th class="num">{{ t('monitoringUi.health.fails') }}</th><th class="num">{{ t('monitoringUi.health.users') }}</th><th class="num">{{ t('monitoringUi.health.last') }}</th>
        </template>
        <template #row="{ row: p }">
          <tr>
            <td><code class="mono">{{ p.provider }}</code></td>
            <td class="num"><ErrLabel>{{ p.failures }}</ErrLabel></td>
            <td class="num">{{ p.users_affected }}</td>
            <td class="num dim">{{ shortTs(p.last_at) }}</td>
          </tr>
        </template>
      </ConsoleTable>
    </ConsoleCard>
  </template>
</template>
