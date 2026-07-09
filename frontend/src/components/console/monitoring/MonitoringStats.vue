<script setup lang="ts">
// Rangée de KPI monitoring — grille fluide de <Stat>. Purement présentationnel
// (données par prop), donc réutilisable à tous les niveaux (plateforme/org/équipe/user).
import Stat from '@/components/console/Stat.vue'

export interface MonitoringStatItem {
  label: string
  value: string | number
  unit?: string
  sub?: string
  tone?: string
}
defineProps<{ items: MonitoringStatItem[] }>()
</script>

<template>
  <div class="grid3">
    <Stat v-for="(s, i) in items" :key="i"
      :label="s.label" :value="s.value" :unit="s.unit" :sub="s.sub" :tone="s.tone" />
  </div>
</template>
