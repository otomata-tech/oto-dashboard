<script setup lang="ts">
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterView } from 'vue-router'
import ConsentBanner from '@/components/console/ConsentBanner.vue'
import ViewAsBanner from '@/components/console/ViewAsBanner.vue'
import ConsultOrgBanner from '@/components/console/ConsultOrgBanner.vue'
import { isBusy } from '@/lib/busy'
import { setFaviconState } from '@/lib/favicon'
import { useMe } from '@/composables/useMe'

// Présence dans l'onglet : le favicon passe en « think » dès qu'un appel réseau
// est en vol, et revient au repos sinon.
watch(isBusy, (busy) => setFaviconState(busy ? 'think' : 'static'), { immediate: true })

// Revalidation SWR de `me` quand l'onglet redevient visible / reprend le focus :
// un onglet resté ouvert reflète ainsi un changement de rôle serveur (promotion
// org_admin/super_admin → entrées de gouvernance) sans hard refresh. Throttlé dans
// `revalidateStale` (no-op si `me` frais ou jamais chargé).
const { revalidateStale } = useMe()
function onWake() { if (document.visibilityState === 'visible') revalidateStale() }
onMounted(() => {
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('focus', onWake)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onWake)
  window.removeEventListener('focus', onWake)
})
</script>

<template>
  <RouterView />
  <ViewAsBanner />
  <ConsultOrgBanner />
  <ConsentBanner />
</template>
