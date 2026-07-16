<script setup lang="ts" generic="T extends string = string">
// Select du design system (popover reka), remplacement 1:1 d'un `<select class="inp">`
// natif (chantier β, lot 1). API minimale : options {value,label}, v-model, placeholder,
// `grow` (participe au flex de la ligne), `size`. Le dropdown s'ouvre au-dessus des
// modales grâce à --z-popover (chantier α).
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

withDefaults(defineProps<{
  modelValue: T
  options: readonly { value: T; label: string; disabled?: boolean }[]
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  grow?: boolean
  size?: 'sm' | 'default'
}>(), { size: 'default' })
const emit = defineEmits<{ 'update:modelValue': [T] }>()
</script>

<template>
  <Select :model-value="modelValue" :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event as T)">
    <SelectTrigger :size="size" :aria-label="ariaLabel" :class="grow ? 'flex-1 w-full min-w-0' : ''">
      <SelectValue :placeholder="placeholder" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">{{ o.label }}</SelectItem>
    </SelectContent>
  </Select>
</template>
