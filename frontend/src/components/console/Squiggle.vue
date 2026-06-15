<script setup lang="ts">
// Souligne le texte du slot d'un trait saffron ondulé (langage Manuscrit chaud).
// Le viewBox est normalisé et étiré (preserveAspectRatio=none) à la largeur du mot.
withDefaults(defineProps<{ sw?: number }>(), { sw: 2 })
</script>

<template>
  <span class="squiggle">
    <slot />
    <svg viewBox="0 0 60 8" fill="none" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 5 Q16 1, 30 4.5 T58 4" :stroke-width="sw" stroke="var(--color-saffron)" stroke-linecap="round" fill="none" />
    </svg>
  </span>
</template>
