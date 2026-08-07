<script setup lang="ts">
// Champ de recherche d'un tableau du datastore — la recherche est SERVEUR (le
// parent refetch), donc la frappe est locale et l'émission débouncée (300 ms).
// Le parent garde LA source de vérité (`search`, miroir d'URL 'q') : ce champ
// n'est qu'un tampon de saisie, resynchronisé dès que la valeur amont change
// (restauration d'un deep-link, changement de tableau, effacement externe).
import { ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
}>(), { placeholder: 'rechercher…' })
const emit = defineEmits<{ 'update:modelValue': [q: string] }>()

const DEBOUNCE_MS = 300
const local = ref(props.modelValue)
let timer: ReturnType<typeof setTimeout> | null = null

watch(() => props.modelValue, (v) => { if (v !== local.value) local.value = v })
watch(local, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { if (v !== props.modelValue) emit('update:modelValue', v) }, DEBOUNCE_MS)
})
</script>

<template>
  <div class="dsb">
    <Icon name="search" :size="14" />
    <input v-model="local" class="dsb-input" :placeholder="placeholder"
      @keydown.esc="local = ''" />
    <slot />
  </div>
</template>

<style scoped>
.dsb { display: flex; align-items: center; gap: 6px; flex: 1; color: var(--color-mute); }
.dsb-input {
  flex: 1; font: inherit; font-size: 12.5px; border: 0; background: none;
  color: var(--color-ink); outline: none;
}
</style>
