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
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SubTabs, { type SubTab } from '@/components/console/SubTabs.vue'
import { useDeepLink } from '@/composables/useDeepLink'
import { useToast } from '@/composables/useToast'
import { oauthReturnToast } from '@/lib/oauthReturn'

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

// Retour OAuth (oto-backend#670) : `?connector=<nom>&connect=connected|error|
// forbidden` atterrit ici pour les 5 connecteurs OAuth (avant ce lot, seuls les
// widgets pollaient leur statut en silence — un échec de consentement (accolades
// cassées sur atlassian/folk, ou simplement aucun lecteur sur les 5) ne disait
// jamais RIEN à l'utilisateur, qui ne savait pas s'il devait réessayer). `connect`
// seul est nettoyé de l'URL après lecture — `connector` reste (deep-link marketplace
// existant, `ConnectorLibraryView`), `tab` a son propre deep-link.
const route = useRoute()
const router = useRouter()
const { toast } = useToast()

onMounted(() => {
  const msg = oauthReturnToast(route.query.connect, route.query.connector)
  if (msg === null) return
  toast(msg)
  const query = { ...route.query }
  delete query.connect
  void router.replace({ query })
})
</script>

<template>
  <div class="fadein">
    <SubTabs :tabs="TABS" :model-value="tab" @update:model-value="select" />
    <div v-if="tab === 'mine'" class="content-inner"><MyConnectors /></div>
    <ConnectorLibrary v-else />
  </div>
</template>
