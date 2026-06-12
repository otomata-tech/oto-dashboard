<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ used: number; total: number; label?: string }>()

const pct = computed(() => Math.min(100, Math.round((props.used / props.total) * 100)))
const cls = computed(() => (pct.value >= 100 ? 'over' : pct.value >= 75 ? 'warn' : ''))
</script>

<template>
  <div class="quota" :class="cls">
    <div class="track"><div class="fill" :style="{ width: pct + '%' }" /></div>
    <div class="lbl"><span>{{ label }}</span><span>{{ used }} / {{ total }}</span></div>
  </div>
</template>
