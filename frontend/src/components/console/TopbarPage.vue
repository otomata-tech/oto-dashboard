<script setup lang="ts">
// Injecte le contenu du slot dans le topbar (#topbar-page) et masque le titre
// statique générique tant que la page est montée (lot 1 retour 8). Un par page.
// Le slot est rendu dans le contexte de la page → ses bindings restent accessibles.
// `claim` (défaut true) : passer `:claim="false"` quand l'en-tête injecté n'a PAS
// son propre titre à dédupliquer — le titre/fil d'ariane générique reste alors
// visible À CÔTÉ du contenu injecté, dans la même barre (ex. ProjectDetailView,
// qui n'a plus de titre de projet local).
import { onBeforeUnmount, onMounted } from 'vue'
import { useTopbar } from '@/composables/useTopbar'

const props = withDefaults(defineProps<{ claim?: boolean }>(), { claim: true })
const { claim: doClaim, release: doRelease } = useTopbar()
onMounted(() => { if (props.claim) doClaim() })
onBeforeUnmount(() => { if (props.claim) doRelease() })
</script>

<template>
  <Teleport to="#topbar-page" defer>
    <slot />
  </Teleport>
</template>
