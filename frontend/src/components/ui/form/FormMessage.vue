<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { toValue } from 'vue'
import { cn } from '@/lib/utils'
import { useFormField } from './useFormField'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()

const { error, formMessageId } = useFormField()
</script>

<template>
  <p
    v-if="toValue(error)"
    :id="formMessageId"
    data-slot="form-message"
    :class="cn('text-[11.5px] font-medium text-destructive', props.class)"
  >
    {{ toValue(error) }}
  </p>
</template>
