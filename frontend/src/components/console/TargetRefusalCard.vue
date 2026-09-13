<script setup lang="ts">
// Une adresse qui n'ouvre pas l'objet demandé (oto#201, oto#203) : le dire — l'objet, le code
// du serveur s'il y en a un, sa phrase — et RIEN à la place. `choices` porte ce qui s'offre au
// lecteur : les candidats d'un nom ambigu, le projet où vit une page. Le choix reste le sien,
// l'écran n'en prend aucun. Résolution et refus : `lib/routeTarget.ts`.
import { RouterLink } from 'vue-router'
import type { TargetChoice } from '@/lib/routeTarget'

defineProps<{
  title: string
  code?: string | null
  detail?: string | null
  choices?: TargetChoice[]
}>()
</script>

<template>
  <div class="card target-refusal" role="alert">
    <div class="target-refusal__t">{{ title }}</div>
    <code v-if="code" class="target-refusal__code">{{ code }}</code>
    <div v-if="detail" class="target-refusal__d">{{ detail }}</div>
    <ul v-if="choices?.length" class="target-refusal__choices">
      <li v-for="c in choices" :key="c.key">
        <RouterLink :to="c.to" class="target-refusal__choice">
          <span class="mono">{{ c.label }}</span>
          <span v-if="c.hint" class="target-refusal__hint">{{ c.hint }}</span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.target-refusal { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; background: var(--color-terra-soft); border-color: var(--color-terra); }
.target-refusal__t { font-size: 14px; font-weight: 700; color: var(--color-terra-ink); }
.target-refusal__code { font-family: var(--font-mono); font-size: 11.5px; color: var(--color-terra-ink); }
.target-refusal__d { font-size: 12.5px; line-height: 1.55; color: var(--color-terra-ink); }
.target-refusal__choices { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.target-refusal__choice { display: inline-flex; align-items: baseline; gap: 8px; font-size: 12.5px; font-weight: 600; color: var(--color-ink); text-decoration: underline; text-underline-offset: 3px; }
.target-refusal__hint { font-size: 11.5px; font-weight: 400; color: var(--color-terra-ink); }
</style>
