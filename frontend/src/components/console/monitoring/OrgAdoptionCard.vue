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

const props = defineProps<{
  adoption: OrgAdoption | null
  windowDays: number
  loading?: boolean
}>()

const members = computed<OrgMemberAdoption[]>(() => props.adoption?.members ?? [])

const kpis = computed(() => {
  const a = props.adoption
  return [
    { label: 'membres', value: a?.total_members ?? 0, sub: 'dans cette org' },
    {
      label: 'actifs', value: a?.active ?? 0,
      sub: `ont invoqué un outil · ${props.windowDays} j`,
      tone: a?.active ? 'var(--color-olive-ink)' : undefined,
    },
    {
      label: 'jamais actifs', value: a?.never_active ?? 0,
      sub: 'compte ouvert, aucun appel',
      tone: a?.never_active ? 'var(--color-saffron-ink)' : undefined,
    },
    {
      label: 'bloqués', value: a?.blocked_by_connector ?? 0,
      sub: 'un connecteur ne résout pas',
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
    <ConsoleCard flush title="adoption par membre">
      <p class="helptext" style="padding: 0 14px 8px">
        seule compte l'activité émise <strong>sous cette org</strong> — un membre actif dans
        une autre org apparaît ici comme inactif.
      </p>
      <ConsoleTable :rows="members" :loaded="!!adoption"
        empty="aucun membre dans cette org.">
        <template #head>
          <th>membre</th><th>état</th><th class="num">appels</th>
          <th class="num">erreurs</th><th class="num">dernier appel</th>
        </template>
        <template #row="{ row: m }">
          <tr>
            <td>
              <div>{{ who(m) }}</div>
              <div v-if="m.name && m.email" class="dim" style="font-size: 11px">{{ m.email }}</div>
            </td>
            <td>
              <Tag v-if="m.calls" tone="olive">actif</Tag>
              <Tag v-else-if="m.connector_failures" tone="terra">bloqué</Tag>
              <Tag v-else tone="saffron">jamais actif</Tag>
            </td>
            <td class="num mono">{{ m.calls }}</td>
            <td class="num"><ErrLabel v-if="m.errors">{{ m.errors }}</ErrLabel><span v-else class="dim">—</span></td>
            <td class="num dim" style="font-size: 12px">{{ shortTs(m.last_call_at) }}</td>
          </tr>
        </template>
      </ConsoleTable>
      <p v-if="adoption?.truncated" class="helptext" style="padding: 8px 14px 0">
        liste limitée aux 500 premiers membres — les compteurs ci-dessus, eux, portent sur
        tous. Pour l'exhaustif : l'export du journal d'audit.
      </p>
    </ConsoleCard>
  </template>
</template>
