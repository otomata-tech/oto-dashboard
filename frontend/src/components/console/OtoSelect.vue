<script setup lang="ts" generic="T extends string = string">
// Select du design system (popover reka), remplacement 1:1 d'un `<select class="inp">`
// natif (chantier β, lot 1). API minimale : options {value,label}, v-model, placeholder,
// `grow` (participe au flex de la ligne), `size`. Le dropdown s'ouvre au-dessus des
// modales grâce à --z-popover (chantier α).
//
// `noneLabel` : ajoute un item de tête « effacer » qui mappe sur la valeur VIDE ('').
// reka refuse la chaîne vide comme valeur d'item → on passe par une sentinelle interne
// (l'extérieur reste '' ↔ pas de valeur, comme l'`<option value="">` natif).
import { computed } from 'vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const props = withDefaults(defineProps<{
  modelValue: T
  options: readonly { value: T; label: string; disabled?: boolean }[]
  placeholder?: string
  noneLabel?: string
  ariaLabel?: string
  disabled?: boolean
  grow?: boolean
  triggerClass?: string
  size?: 'sm' | 'default'
}>(), { size: 'default' })
const emit = defineEmits<{ 'update:modelValue': [T] }>()

const NONE = '__oto_none__'
// Valeur passée à reka : la sentinelle quand on est « vide » ET qu'un item none existe.
const inner = computed(() => (props.modelValue === '' && props.noneLabel != null ? NONE : props.modelValue))
function onUpdate(v: unknown) {
  emit('update:modelValue', (v === NONE ? '' : v) as T)
}

// reka lit le libellé affiché (fermé) depuis le DOM des `SelectItem`, qui ne sont
// montés qu'à l'ouverture du menu → si `options` change pendant que le select est
// fermé (ex. compteurs qui arrivent après un fetch async), le libellé affiché reste
// figé jusqu'au prochain clic. On calcule nous-mêmes le libellé courant (réactif,
// indépendant du montage DOM) et on le passe en enfant explicite de `SelectValue`.
const currentLabel = computed(() => {
  if (props.modelValue === '' && props.noneLabel != null) return props.noneLabel
  return props.options.find((o) => o.value === props.modelValue)?.label
})
</script>

<template>
  <Select :model-value="inner" :disabled="disabled" @update:model-value="onUpdate">
    <SelectTrigger :size="size" :aria-label="ariaLabel" :class="[grow ? 'flex-1 w-full min-w-0' : '', triggerClass]">
      <SelectValue :placeholder="placeholder">
        <template v-if="currentLabel != null">{{ currentLabel }}</template>
      </SelectValue>
    </SelectTrigger>
    <SelectContent position="popper" :side-offset="4">
      <SelectItem v-if="noneLabel != null" :value="NONE">{{ noneLabel }}</SelectItem>
      <SelectItem v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">{{ o.label }}</SelectItem>
    </SelectContent>
  </Select>
</template>
