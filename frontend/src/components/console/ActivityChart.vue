<script setup lang="ts">
// Graphique d'activité — aire journalière sur N jours (Unovis, stack Chart shadcn-vue).
// Agrège une liste d'événements horodatés en buckets/jour. Themé saffron.
// Dégrade gracieusement : < 2 jours avec activité → rien (le parent garde sa liste).
import { computed } from 'vue'
import { VisXYContainer, VisArea, VisLine, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'
import type { ProjectActivity } from '@/types/api'

const props = withDefaults(defineProps<{
  activity: ProjectActivity[]
  days?: number
}>(), { days: 14 })

interface Bucket { i: number; day: string; label: string; count: number }

// Buckets d'un jour, du plus ancien (i=0) au plus récent (i=days-1). On borne au
// jour courant côté client — l'activité porte un created_at 'YYYY-MM-DD HH:MM:SS'.
const buckets = computed<Bucket[]>(() => {
  const n = props.days
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const out: Bucket[] = []
  const byDay = new Map<string, number>()
  for (const a of props.activity) {
    const key = String(a.created_at ?? '').slice(0, 10)
    if (key) byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(today)
    d.setDate(today.getDate() - k)
    const key = d.toISOString().slice(0, 10)
    out.push({
      i: n - 1 - k,
      day: key,
      label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      count: byDay.get(key) ?? 0,
    })
  }
  return out
})

const total = computed(() => buckets.value.reduce((s, b) => s + b.count, 0))
const show = computed(() => total.value > 0 && buckets.value.length >= 2)

const x = (d: Bucket) => d.i
const y = (d: Bucket) => d.count
const tickFormat = (i: number) => buckets.value[i]?.label ?? ''
const tooltipTemplate = (d: Bucket) => `${d.label} · ${d.count} évén.${d.count > 1 ? 's' : ''}`
</script>

<template>
  <div v-if="show" class="ac">
    <VisXYContainer :data="buckets" :height="72" :margin="{ top: 6, bottom: 18, left: 4, right: 4 }">
      <VisArea :x="x" :y="y" color="var(--color-saffron)" :opacity="0.16" />
      <VisLine :x="x" :y="y" color="var(--color-saffron)" :lineWidth="1.6" />
      <VisAxis type="x" :tickFormat="tickFormat" :numTicks="Math.min(buckets.length, 5)" :gridLine="false" :domainLine="false" />
      <VisCrosshair color="var(--color-saffron)" :template="tooltipTemplate" />
      <VisTooltip />
    </VisXYContainer>
    <div class="ac__foot">
      <span class="ac__k">{{ total }}</span> événement{{ total > 1 ? 's' : '' }} · {{ days }} derniers jours
    </div>
  </div>
</template>

<style scoped>
.ac { margin: 8px 0 2px; }
.ac__foot { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.04em; color: var(--color-faint); margin-top: 2px; }
.ac__k { color: var(--color-ink-soft); font-weight: 600; }
/* Unovis expose ses styles via des variables CSS — on aligne axes/tooltip sur les tokens console. */
.ac :deep(.unovis-xy-container) { --vis-axis-tick-label-color: var(--color-faint); --vis-axis-tick-label-font-size: 9px; --vis-font-family: var(--font-mono); }
.ac :deep(.unovis-tooltip) { --vis-tooltip-background-color: var(--color-ink); --vis-tooltip-text-color: var(--color-bg); --vis-tooltip-border-color: var(--color-ink); --vis-tooltip-padding: 5px 8px; font-family: var(--font-sans); font-size: 11px; }
</style>
