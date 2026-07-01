<script setup lang="ts">
// Appels/jour empilés ok (olive) / erreurs (terra) — Unovis, drop-in de DayBars
// (mêmes props `days: [ok, err][]`). Isolé en chunk async côté vues appelantes.
import { computed } from 'vue'
import { VisXYContainer, VisStackedBar, VisStackedBarSelectors, VisTooltip } from '@unovis/vue'

const props = withDefaults(defineProps<{ days: [number, number][]; height?: number }>(), { height: 96 })

interface Bar { i: number; ok: number; err: number }
const data = computed<Bar[]>(() => props.days.map(([ok, err], i) => ({ i, ok, err })))

const x = (d: Bar) => d.i
const y = [(d: Bar) => d.ok, (d: Bar) => d.err]
const colors = ['var(--color-olive)', 'var(--color-terra)']
const tooltip = (d: Bar) => `${d.ok + d.err} appels · ${d.err} erreur${d.err > 1 ? 's' : ''}`
</script>

<template>
  <div class="cbc" :style="{ height: height + 'px' }">
    <VisXYContainer :data="data" :height="height" :margin="{ top: 6, bottom: 4, left: 4, right: 4 }">
      <VisStackedBar :x="x" :y="y" :color="colors" :roundedCorners="2" :barPadding="0.28" />
      <VisTooltip :triggers="{ [VisStackedBarSelectors.bar]: tooltip }" />
    </VisXYContainer>
  </div>
</template>

<style scoped>
.cbc :deep(.unovis-tooltip) { --vis-tooltip-background-color: var(--color-ink); --vis-tooltip-text-color: var(--color-bg); --vis-tooltip-border-color: var(--color-ink); --vis-tooltip-padding: 5px 8px; font-family: var(--font-sans); font-size: 11px; }
</style>
