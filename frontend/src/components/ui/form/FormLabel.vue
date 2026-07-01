<script setup lang="ts">
import type { LabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useFormField } from './useFormField'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>()

const { error, formItemId } = useFormField()
</script>

<template>
  <Label
    data-slot="form-label"
    :data-error="!!error"
    :for="formItemId"
    :class="cn('data-[error=true]:text-destructive', props.class)"
  >
    <slot />
  </Label>
</template>
