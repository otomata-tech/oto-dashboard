<script setup lang="ts">
import { watch } from 'vue'
import { RouterView } from 'vue-router'
import ConsentBanner from '@/components/console/ConsentBanner.vue'
import ViewAsBanner from '@/components/console/ViewAsBanner.vue'
import OrgReadonlyBanner from '@/components/console/OrgReadonlyBanner.vue'
import { isBusy } from '@/lib/busy'
import { setFaviconState } from '@/lib/favicon'

// Présence dans l'onglet : le favicon passe en « think » dès qu'un appel réseau
// est en vol, et revient au repos sinon.
watch(isBusy, (busy) => setFaviconState(busy ? 'think' : 'static'), { immediate: true })
</script>

<template>
  <RouterView />
  <ViewAsBanner />
  <OrgReadonlyBanner />
  <ConsentBanner />
</template>
