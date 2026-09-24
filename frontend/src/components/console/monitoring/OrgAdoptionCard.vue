<script setup lang="ts">
// Adoption d'une org, membre par membre — la question « mon équipe s'en sert-elle ? ».
// Pendant du funnel plateforme (ActivationFunnelCard) à l'échelle d'une équipe, avec la
// même distinction fondatrice COMPTE ≠ USAGE, plus une seconde que seul ce niveau peut
// exploiter : « n'a jamais essayé » (à embarquer) vs « a essayé et rien ne résolvait »
// (à débloquer — un credential manque). Deux gestes opposés, d'où deux colonnes.
// Présentationnel (données par prop).
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import MonitoringStats from './MonitoringStats.vue'
import Tag from '@/components/console/Tag.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import type { OrgAdoption, OrgMemberAdoption } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  adoption: OrgAdoption | null
  windowDays: number
  loading?: boolean
}>()

const members = computed<OrgMemberAdoption[]>(() => props.adoption?.members ?? [])

const kpis = computed(() => {
  const a = props.adoption
  return [
    { label: t('monitoringUi.adoption.members'), value: a?.total_members ?? 0, sub: t('monitoringUi.adoption.inOrg') },
    {
      label: t('monitoringUi.adoption.active'), value: a?.active ?? 0,
      sub: t('monitoringUi.adoption.invoked', { n: props.windowDays }),
      tone: a?.active ? 'var(--color-olive-ink)' : undefined,
    },
    {
      label: t('monitoringUi.adoption.neverActive'), value: a?.never_active ?? 0,
      sub: t('monitoringUi.adoption.openNoCall'),
      tone: a?.never_active ? 'var(--color-saffron-ink)' : undefined,
    },
    {
      label: t('monitoringUi.adoption.blocked'), value: a?.blocked_by_connector ?? 0,
      sub: t('monitoringUi.adoption.notResolving'),
      tone: a?.blocked_by_connector ? 'var(--color-terra-ink)' : undefined,
    },
  ]
})

const shortTs = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '—')
const who = (m: OrgMemberAdoption) => m.name || m.email || m.sub
</script>

<template>
  <div v-if="loading && !adoption" class="grid3">
    <div v-for="i in 4" :key="i" class="sk" style="height: 74px" />
  </div>
  <template v-else>
    <MonitoringStats :items="kpis" />
    <ConsoleCard flush :title="t('monitoringUi.adoption.title')">
      <p class="helptext" style="padding: 0 14px 8px">
        <i18n-t keypath="monitoringUi.adoption.onlyOrg" tag="span"><template #org><strong>{{ t('monitoringUi.adoption.underOrg') }}</strong></template></i18n-t>
      </p>
      <ConsoleTable :rows="members" :loaded="!!adoption"
        :empty="t('monitoringUi.adoption.empty')">
        <template #head>
          <th>{{ t('monitoringUi.adoption.member') }}</th><th>{{ t('monitoringUi.adoption.state') }}</th><th class="num">{{ t('monitoringUi.adoption.calls') }}</th>
          <th class="num">{{ t('monitoringUi.adoption.errors') }}</th><th class="num">{{ t('monitoringUi.adoption.lastCall') }}</th>
        </template>
        <template #row="{ row: m }">
          <tr>
            <td>
              <div>{{ who(m) }}</div>
              <div v-if="m.name && m.email" class="dim" style="font-size: 11px">{{ m.email }}</div>
            </td>
            <td>
              <Tag v-if="m.calls" tone="olive">{{ t('monitoringUi.adoption.isActive') }}</Tag>
              <Tag v-else-if="m.connector_failures" tone="terra">{{ t('monitoringUi.adoption.isBlocked') }}</Tag>
              <Tag v-else tone="saffron">{{ t('monitoringUi.adoption.isNever') }}</Tag>
            </td>
            <td class="num mono">{{ m.calls }}</td>
            <td class="num"><ErrLabel v-if="m.errors">{{ m.errors }}</ErrLabel><span v-else class="dim">—</span></td>
            <td class="num dim" style="font-size: 12px">{{ shortTs(m.last_call_at) }}</td>
          </tr>
        </template>
      </ConsoleTable>
      <p v-if="adoption?.truncated" class="helptext" style="padding: 8px 14px 0">
        {{ t('monitoringUi.adoption.truncated') }}
      </p>
    </ConsoleCard>
  </template>
</template>
