<script setup lang="ts">
// Lien vers la FICHE plateforme d'un compte ou d'une organisation (24/09/2026). Les écrans
// d'admin affichaient un nom sans lien : pour passer de la fiche d'une org à celle d'un de
// ses membres, il fallait revenir à la liste et chercher. Un seul composant, pour que tout
// nom de compte ou d'org, où qu'il soit, mène à sa fiche de la même façon.
// Réservé aux écrans /platform/* (les fiches y vivent). `@click.stop` : la ligne d'un
// tableau peut elle-même être cliquable, le lien ne doit pas la déclencher en plus.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{ kind: 'user' | 'org'; id: string | number | null | undefined; label?: string | null }>()
const to = computed(() => {
  if (props.id == null || props.id === '') return null
  return props.kind === 'user'
    ? `/platform/users/${encodeURIComponent(String(props.id))}`
    : `/platform/orgs/${props.id}`
})
</script>

<template>
  <RouterLink v-if="to" :to="to" class="eref" @click.stop><slot>{{ label || id }}</slot></RouterLink>
  <span v-else><slot>{{ label || '—' }}</slot></span>
</template>

<style scoped>
.eref { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--color-hair); }
.eref:hover { color: var(--color-cobalt-ink); border-bottom-color: currentColor; }
</style>
