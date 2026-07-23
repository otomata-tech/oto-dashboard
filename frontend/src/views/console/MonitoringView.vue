<script setup lang="ts">
// Supervision plateforme (/platform/monitoring) — point d'entrée UNIQUE de
// l'observabilité, à deux onglets câblés sur `?tab=` (deep-link, back/forward) :
//   • sante — santé technique : funnel, appels MCP/REST, santé connecteurs, journal
//             brut (panneau MonitoringHealthView, ex-MonitoringView).
//   • usage — signaux produit : déroulés (runs), manques signalés, qualité des
//             outils (panneau UsageView, ex-/platform/usage qui redirige ici).
// Fusion 2026-07-23 : une entrée de nav en moins, pas de méga-page empilée.
import { computed, defineAsyncComponent, ref } from 'vue'
import SubTabs, { type SubTab } from '@/components/console/SubTabs.vue'
import { useDeepLink } from '@/composables/useDeepLink'

const Health = defineAsyncComponent(() => import('./MonitoringHealthView.vue'))
const Usage = defineAsyncComponent(() => import('./UsageView.vue'))

const TABS = computed<SubTab[]>(() => [
  { key: 'sante', label: 'santé', hint: 'appels, erreurs, connecteurs, journal' },
  { key: 'usage', label: 'signaux d’usage', hint: 'déroulés, manques, qualité des outils' },
])
const VALID = computed(() => new Set(TABS.value.map((t) => t.key)))

const dl = useDeepLink('tab', (v) => { tab.value = v && VALID.value.has(v) ? v : 'sante' })
const tab = ref(VALID.value.has(dl.read() ?? '') ? dl.read()! : 'sante')

function select(key: string) {
  tab.value = key
  dl.set(key === 'sante' ? null : key)
}
</script>

<template>
  <div class="fadein">
    <SubTabs :tabs="TABS" :model-value="tab" @update:model-value="select" />
    <Health v-if="tab === 'sante'" />
    <Usage v-else />
  </div>
</template>
