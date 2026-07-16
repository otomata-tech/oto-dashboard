<script setup lang="ts">
// Injecte le contenu du slot dans le topbar (#topbar-page) et masque le titre
// statique générique tant que la page est montée (lot 1 retour 8). Un par page.
// Le slot est rendu dans le contexte de la page → ses bindings restent accessibles.
import { onBeforeUnmount, onMounted } from 'vue'
import { useTopbar } from '@/composables/useTopbar'

const { claim, release } = useTopbar()
onMounted(claim)
onBeforeUnmount(release)
</script>

<template>
  <Teleport to="#topbar-page" defer>
    <slot />
  </Teleport>
</template>
