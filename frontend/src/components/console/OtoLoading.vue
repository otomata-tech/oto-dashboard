<script setup lang="ts">
// Idiome « réfléchit » inline : la marque d'Oto (think) + un libellé optionnel.
// Remplace les « chargement… » / « loading… » textuels dans les vues.
import OtoMark from './OtoMark.vue'

withDefaults(defineProps<{ label?: string; size?: number }>(), { label: '', size: 15 })
</script>

<template>
  <span class="oto-loading">
    <OtoMark variant="mono" state="think" :size="size" />
    <span v-if="label">{{ label }}</span>
  </span>
</template>

<style scoped>
.oto-loading {
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--color-mute); font-size: inherit;
}
</style>
