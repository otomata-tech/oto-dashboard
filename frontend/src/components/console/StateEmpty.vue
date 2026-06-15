<script setup lang="ts">
// État vide éditorial : medallion saffron + titre (avec Squiggle composé par
// l'appelant) + corps + CTA. Réutilisé par Overview / Connectors.
withDefaults(defineProps<{ medallion?: 'md' | 'lg' }>(), { medallion: 'lg' })
</script>

<template>
  <div class="state-empty">
    <span class="o-medallion" :class="`o-medallion-${medallion}`">o</span>
    <div class="se-title"><slot name="title" /></div>
    <div class="se-body"><slot /></div>
    <div v-if="$slots.cta" class="se-cta"><slot name="cta" /></div>
  </div>
</template>
