<script setup lang="ts">
// Point d'entrée UNIFIÉ des connecteurs (/connectors) : un seul écran à trois
// onglets, câblés sur `?tab=` (deep-link, back/forward, refresh par construction) :
//   • mine        — mes connecteurs : connexion (credential) + outils
//                   (panneau historique ConnectorsView, projection USER ADR 0022).
//   • shared      — connecteurs que je peux utiliser grâce à une clé partagée de
//                   mon org / mon équipe (lentille de consommation, lecture seule).
//   • marketplace — catalogue navigable de tous les connecteurs (ex-bibliothèque).
// Les ex-routes /library/connectors redirigent ici (?tab=marketplace).
import { computed, defineAsyncComponent, ref } from 'vue'
import SubTabs, { type SubTab } from '@/components/console/SubTabs.vue'
import { useDeepLink } from '@/composables/useDeepLink'
import { useMe } from '@/composables/useMe'

const MyConnectors = defineAsyncComponent(() => import('./ConnectorsView.vue'))
const SharedConnectors = defineAsyncComponent(() => import('./ConnectorsSharedView.vue'))
const ConnectorLibrary = defineAsyncComponent(() => import('./ConnectorLibraryView.vue'))
const ConnectorKeys = defineAsyncComponent(() => import('./ConnectorKeysPanel.vue'))

const { me } = useMe()
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin')

// L'onglet « clés » (audit des clés partagées) n'apparaît qu'à l'org_admin.
const TABS = computed<SubTab[]>(() => [
  { key: 'mine', label: 'mes connecteurs', hint: 'connexion, clés et outils' },
  { key: 'shared', label: 'partagés', hint: 'connecteurs fournis par mon org / équipe' },
  ...(isOrgAdmin.value ? [{ key: 'keys', label: 'clés partagées', hint: "audit des clés d'org & d'équipe" }] : []),
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
    <MyConnectors v-if="tab === 'mine'" />
    <SharedConnectors v-else-if="tab === 'shared'" />
    <ConnectorKeys v-else-if="tab === 'keys'" />
    <ConnectorLibrary v-else />
  </div>
</template>
