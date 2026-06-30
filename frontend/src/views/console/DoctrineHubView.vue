<script setup lang="ts">
// Point d'entrée UNIFIÉ des doctrines (/doctrine) : un seul écran à deux onglets,
// câblés sur `?tab=` (deep-link / back-forward / refresh) :
//   • mine        — mes doctrines : doctrine de base + skills de l'org/équipe,
//                   édition, versions, usage (panneau historique DoctrineView).
//   • marketplace — bibliothèque publique de doctrines (preview + fork), ex-route
//                   /library/doctrines qui redirige désormais ici (?tab=marketplace).
import { defineAsyncComponent, ref } from 'vue'
import SubTabs, { type SubTab } from '@/components/console/SubTabs.vue'
import { useDeepLink } from '@/composables/useDeepLink'

const MyDoctrine = defineAsyncComponent(() => import('./DoctrineView.vue'))
const DoctrineLibrary = defineAsyncComponent(() => import('./DoctrineLibraryView.vue'))

const TABS: SubTab[] = [
  { key: 'mine', label: 'mes doctrines', hint: 'doctrine de base + skills de mon org' },
  { key: 'marketplace', label: 'marketplace', hint: 'bibliothèque publique — preview & fork' },
]
const VALID = new Set(TABS.map((t) => t.key))

const dl = useDeepLink('tab', (v) => { tab.value = v && VALID.has(v) ? v : 'mine' })
const tab = ref(VALID.has(dl.read() ?? '') ? dl.read()! : 'mine')

function select(key: string) {
  tab.value = key
  dl.set(key === 'mine' ? null : key)
}
</script>

<template>
  <div class="fadein">
    <SubTabs :tabs="TABS" :model-value="tab" @update:model-value="select" />
    <MyDoctrine v-if="tab === 'mine'" />
    <DoctrineLibrary v-else />
  </div>
</template>
