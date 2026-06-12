<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{
  kind?: 'ghost' | 'mini' | 'danger' | 'link'
  icon?: string
}>()

const cls = computed(() => {
  switch (props.kind) {
    case 'ghost': return 'btn ghost'
    case 'mini': return 'btn-mini'
    case 'danger': return 'btn-mini danger'
    case 'link': return 'linklike'
    default: return 'btn'
  }
})
</script>

<template>
  <button :class="cls">
    <Icon v-if="icon" :name="icon" :size="13" />
    <slot />
  </button>
</template>
