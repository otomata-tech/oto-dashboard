<script setup lang="ts">
import type { DotTone } from '@/lib/consoleTypes'

const props = withDefaults(defineProps<{ tone?: DotTone; size?: number }>(), {
  tone: 'olive',
  size: 8,
})

const COLORS: Record<DotTone, string> = {
  olive: 'var(--color-olive)',
  terra: 'var(--color-terra)',
  saffron: 'var(--color-saffron)',
  cobalt: 'var(--color-cobalt)',
  faint: 'var(--color-hair-classic)',
}
</script>

<template>
  <span :style="{ display: 'inline-block', width: size + 'px', height: size + 'px', borderRadius: '999px', background: COLORS[tone], flexShrink: 0 }" />
</template>
