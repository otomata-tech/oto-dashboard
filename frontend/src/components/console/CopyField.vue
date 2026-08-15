<script setup lang="ts">
import Icon from './Icon.vue'
import { useToast } from '@/composables/useToast'

// `label` optionnel : une valeur technique isolée se lit seule (endpoint MCP), mais
// dès qu'une carte en aligne plusieurs (émetteur, jwks, client oauth…) chacune doit
// dire ce qu'elle est. Rendu en `.eyebrow` (mono, DS) — ajouté ici plutôt que
// recopié dans les vues : le besoin est apparu 4× sur un seul écran.
const props = defineProps<{ value: string; label?: string }>()
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
  <div>
    <div v-if="label" class="eyebrow" style="margin-bottom: 4px">{{ label }}</div>
    <div class="copyfield">
      <code>{{ value }}</code>
      <button class="btn-mini" @click="copy"><Icon name="copy" :size="12" /> copy</button>
    </div>
  </div>
</template>
