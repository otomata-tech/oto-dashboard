<script setup lang="ts">
// Marque Oto vivante. `state` exprime l'activité : static (repos), idle
// (respiration), think (réfléchit — chargements), talk (parle — réservé aux
// surfaces qui streament). Le SVG vient du moteur partagé (src/lib/mark.ts).
import { computed } from 'vue'
import { markInner, MARK_VIEWBOX, type MarkVariant, type MarkState } from '@/lib/mark'

const props = withDefaults(defineProps<{
  variant?: MarkVariant
  state?: MarkState
  size?: number
  title?: string
}>(), { variant: 'mono', state: 'static', size: 28, title: 'Oto' })

const inner = computed(() => markInner(props.variant, props.state))
</script>

<template>
  <svg
    class="oto-mark"
    :width="size"
    :height="size"
    :viewBox="MARK_VIEWBOX"
    role="img"
    :aria-label="title"
    v-html="inner"
  />
</template>

<!-- Non-scoped à dessein : le SVG est injecté via v-html (le scoping Vue ne
     l'atteindrait pas). Classes préfixées `oto-` pour éviter toute collision. -->
<style>
.oto-mark { display: block; }
.oto-mark .oto-breathe { transform-box: fill-box; transform-origin: center; animation: oto-breathe 4.2s ease-in-out infinite; }
.oto-mark .oto-orbit { transform-box: fill-box; transform-origin: center; animation: oto-spin 7s linear infinite; }
.oto-mark .oto-corespin { transform-box: fill-box; transform-origin: center; animation: oto-spin-rev 11s linear infinite; }
.oto-mark .oto-twinkle circle { animation: oto-tw 2.2s ease-in-out infinite; }
.oto-mark .oto-wave line { transform-box: fill-box; transform-origin: center; animation: oto-amp 1.1s ease-in-out infinite; }

@keyframes oto-breathe { 0%, 100% { transform: scale(1); opacity: .85; } 50% { transform: scale(1.06); opacity: 1; } }
@keyframes oto-spin { to { transform: rotate(360deg); } }
@keyframes oto-spin-rev { to { transform: rotate(-360deg); } }
@keyframes oto-tw { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }
@keyframes oto-amp { 0%, 100% { transform: scaleY(.5); } 50% { transform: scaleY(1.15); } }

@media (prefers-reduced-motion: reduce) {
  .oto-mark .oto-breathe,
  .oto-mark .oto-orbit,
  .oto-mark .oto-corespin,
  .oto-mark .oto-twinkle circle,
  .oto-mark .oto-wave line { animation: none; }
}
</style>
