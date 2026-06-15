<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: string | number
  unit?: string
  sub?: string
  tone?: string
  spark?: number[]
}>()

// Sparkline : normalise les valeurs dans un viewBox 72×26.
const sparkPoints = computed(() => {
  const v = props.spark
  if (!v || v.length < 2) return ''
  const min = Math.min(...v), max = Math.max(...v)
  const span = max - min || 1
  const n = v.length
  return v
    .map((x, i) => `${(i / (n - 1)) * 70 + 1},${22 - ((x - min) / span) * 18}`)
    .join(' ')
})
const sparkLast = computed(() => {
  const p = sparkPoints.value.split(' ').pop()
  return p ? p.split(',').map(Number) : null
})
</script>

<template>
  <div class="stat">
    <div class="l">{{ label }}</div>
    <div class="v" :class="{ 'with-spark': sparkPoints }" :style="tone ? { color: tone } : undefined">
      <span>{{ value }}<span v-if="unit" class="unit">{{ unit }}</span></span>
      <svg v-if="sparkPoints" class="spark" width="72" height="26" viewBox="0 0 72 26" fill="none">
        <polyline :points="sparkPoints" stroke="var(--color-saffron)" stroke-width="1.6"
          stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <circle v-if="sparkLast" :cx="sparkLast[0]" :cy="sparkLast[1]" r="2.1" fill="var(--color-saffron)" />
      </svg>
    </div>
    <div v-if="sub" class="sub">{{ sub }}</div>
  </div>
</template>
