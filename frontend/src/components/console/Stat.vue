<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  unit?: string
  sub?: string
  tone?: string
}>()
</script>

<template>
  <div class="stat">
    <div class="l">{{ label }}</div>
    <div class="v" :style="tone ? { color: tone } : undefined">
      {{ value }}<span v-if="unit" class="unit">{{ unit }}</span>
    </div>
    <div v-if="sub" class="sub">{{ sub }}</div>
  </div>
</template>
