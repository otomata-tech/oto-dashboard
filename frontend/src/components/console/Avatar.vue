<script setup lang="ts">
import { computed } from 'vue'

// Avatar/logo réutilisable : rend l'image si `src`, sinon l'initiale (fallback
// texte, même rendu que l'ancien rond sidebar). `shape` rond (user) ou carré
// arrondi (logo d'org).
const props = withDefaults(
  defineProps<{
    src?: string | null
    name?: string | null
    size?: number
    shape?: 'circle' | 'square'
  }>(),
  { size: 26, shape: 'circle' },
)

const initial = computed(() => (props.name || '?').trim().charAt(0).toLowerCase() || '?')
const radius = computed(() => (props.shape === 'square' ? '7px' : '999px'))
const fontSize = computed(() => Math.round(props.size * 0.42))
</script>

<template>
  <span
    class="av"
    :style="{ width: `${size}px`, height: `${size}px`, borderRadius: radius }"
  >
    <img v-if="src" :src="src" :alt="name || ''" :style="{ borderRadius: radius }" />
    <span v-else class="av-initial" :style="{ fontSize: `${fontSize}px` }">{{ initial }}</span>
  </span>
</template>

<style scoped>
.av {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--color-ink);
  color: var(--color-bg);
}
.av img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.av-initial {
  font-family: var(--font-sans);
  font-weight: 600;
  font-style: italic;
  line-height: 1;
}
</style>
