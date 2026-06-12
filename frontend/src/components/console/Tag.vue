<script setup lang="ts">
defineProps<{ tone?: 'olive' | 'saffron' | 'terra' | 'cobalt' | 'ink' }>()
</script>

<template>
  <span class="tag" :class="tone">
    <slot />
  </span>
</template>
