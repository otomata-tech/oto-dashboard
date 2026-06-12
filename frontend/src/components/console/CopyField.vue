<script setup lang="ts">
import Icon from './Icon.vue'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ value: string }>()
const { toast } = useToast()

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    toast('copied to clipboard')
  } catch {
    toast('copy failed')
  }
}
</script>

<template>
  <div class="copyfield">
    <code>{{ value }}</code>
    <button class="btn-mini" @click="copy"><Icon name="copy" :size="12" /> copy</button>
  </div>
</template>
