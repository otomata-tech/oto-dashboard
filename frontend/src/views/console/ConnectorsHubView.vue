<script setup lang="ts">
// Point d'entrée UNIFIÉ des connecteurs (/connectors) : un seul écran à deux
// onglets, câblés sur `?tab=` (deep-link, back/forward, refresh par construction) :
//   • mine        — mes connecteurs : connexion (credential) + outils
//                   (panneau historique ConnectorsView, projection USER ADR 0022).
//   • marketplace — catalogue navigable de tous les connecteurs (ex-bibliothèque).
// Les ex-routes /library/connectors redirigent ici (?tab=marketplace).
// NB : les onglets « partagés »/« clés partagées » ont été retirés (simplification
// du header) — ConnectorsSharedView.vue/ConnectorKeysPanel.vue restent dans le
// repo mais ne sont plus montés nulle part.
import { computed, defineAsyncComponent, ref } from 'vue'
import SubTabs, { type SubTab } from '@/components/console/SubTabs.vue'
import { useDeepLink } from '@/composables/useDeepLink'

const MyConnectors = defineAsyncComponent(() => import('@/components/console/connector-scope/ConnectorScopeView.vue'))
const ConnectorLibrary = defineAsyncComponent(() => import('./ConnectorLibraryView.vue'))

const TABS = computed<SubTab[]>(() => [
  { key: 'mine', label: 'mes connecteurs', hint: 'connexion, clés et outils' },
  { key: 'marketplace', label: 'marketplace', hint: 'parcourir tout le catalogue' },
])
const VALID = computed(() => new Set(TABS.value.map((t) => t.key)))

const dl = useDeepLink('tab', (v) => { tab.value = v && VALID.value.has(v) ? v : 'mine' })
const tab = ref(VALID.value.has(dl.read() ?? '') ? dl.read()! : 'mine')

function select(key: string) {
  tab.value = key
  dl.set(key === 'mine' ? null : key)
}
</script>

<template>
  <div class="fadein">
    <SubTabs :tabs="TABS" :model-value="tab" @update:model-value="select" />
    <div v-if="tab === 'mine'" class="content-inner"><MyConnectors /></div>
    <ConnectorLibrary v-else />
  </div>
</template>
