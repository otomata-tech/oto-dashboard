<script setup lang="ts">
// Crédits cumulés dans le temps (Unovis) — cumul des mouvements de wallet
// (top-ups + stock de base + ajustements). ⚠️ ce n'est PAS le solde live : l'usage
// à l'appel est mesuré en direct sur le solde, hors transactions (cf. carte). Isolé
// en chunk async côté vue, ne se rend que s'il y a ≥ 2 mouvements.
import { computed } from 'vue'
import { VisXYContainer, VisArea, VisLine, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'
import type { CreditTransaction } from '@/types/api'

const props = defineProps<{ transactions: CreditTransaction[] }>()

interface Point { i: number; label: string; delta: number; cum: number }

const points = computed<Point[]>(() => {
  const sorted = [...props.transactions].sort(
    (a, b) => String(a.created_at).localeCompare(String(b.created_at)),
  )
  let cum = 0
  return sorted.map((t, i) => {
    cum += t.delta
    return {
      i,
      label: String(t.created_at ?? '').slice(0, 10),
      delta: t.delta,
      cum,
    }
  })
})

const show = computed(() => points.value.length >= 2)
const totalAdded = computed(() => points.value.at(-1)?.cum ?? 0)

const x = (d: Point) => d.i
const y = (d: Point) => d.cum
const tickFormat = (i: number) => {
  const d = points.value[i]?.label ?? ''
  return d ? d.slice(5) : '' // MM-DD
}
const tooltipTemplate = (d: Point) =>
  `${d.label} · ${d.delta >= 0 ? '+' : ''}${d.delta.toLocaleString('en-US')} · cumul ${d.cum.toLocaleString('en-US')}`
</script>

<template>
  <div v-if="show" class="ch">
    <VisXYContainer :data="points" :height="96" :margin="{ top: 8, bottom: 20, left: 6, right: 6 }">
      <VisArea :x="x" :y="y" color="var(--color-saffron)" :opacity="0.16" />
      <VisLine :x="x" :y="y" color="var(--color-saffron)" :lineWidth="1.8" />
      <VisAxis type="x" :tickFormat="tickFormat" :numTicks="Math.min(points.length, 6)" :gridLine="false" :domainLine="false" />
      <VisAxis type="y" :numTicks="3" :gridLine="true" :domainLine="false" />
      <VisCrosshair color="var(--color-saffron)" :template="tooltipTemplate" />
      <VisTooltip />
    </VisXYContainer>
    <div class="ch__foot">
      <span class="ch__k">{{ totalAdded.toLocaleString('en-US') }}</span> crédits cumulés · {{ points.length }} mouvements
    </div>
  </div>
</template>

<style scoped>
.ch { margin: 4px 0 14px; }
.ch__foot { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.04em; color: var(--color-faint); margin-top: 2px; }
.ch__k { color: var(--color-ink-soft); font-weight: 600; }
.ch :deep(.unovis-xy-container) { --vis-axis-tick-label-color: var(--color-faint); --vis-axis-tick-label-font-size: 9px; --vis-axis-grid-color: var(--color-hair-soft); --vis-font-family: var(--font-mono); }
.ch :deep(.unovis-tooltip) { --vis-tooltip-background-color: var(--color-ink); --vis-tooltip-text-color: var(--color-bg); --vis-tooltip-border-color: var(--color-ink); --vis-tooltip-padding: 5px 8px; font-family: var(--font-sans); font-size: 11px; }
</style>
