<script setup lang="ts">
import { useSlots } from 'vue'

const props = defineProps<{
  title?: string
  sub?: string
  flush?: boolean
}>()

const slots = useSlots()
const hasHead = () => props.title || slots.title || slots.actions
</script>

<template>
  <section class="card" :class="{ flush }">
    <div v-if="hasHead()" class="card-head">
      <div>
        <div class="t">
          <slot name="title">{{ title }}</slot>
        </div>
        <div v-if="sub" class="s">{{ sub }}</div>
      </div>
      <div v-if="$slots.actions" class="actions">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>
