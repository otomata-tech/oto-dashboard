<script setup lang="ts">
// Supervision plateforme (/platform/monitoring) — point d'entrée UNIQUE de
// l'observabilité, décomposé en SOUS-PAGES `?tab=` (une lentille par onglet, fin de
// la pile de sections — refonte 2026-07-23) :
//   • activation   — funnel COMPTE ≠ USAGE (santé du compte).
//   • mcp          — invocations d'outils par l'agent (KPIs, volume/jour, par outil,
//                    par appelant).
//   • rest         — requêtes /api/* (KPIs, par route).
//   • connecteurs  — échecs de résolution de credential.
//   • journal      — les 100 derniers appels bruts.
//   • usage        — signaux produit : déroulés, manques, qualité des outils
//                    (panneau UsageView, ex-/platform/usage qui redirige ici).
// Le sélecteur de fenêtre (7/30/90 j, `?win=`) est PARTAGÉ par les lentilles
// fenêtrées ; les données sont chargées en un Promise.all fenêtré (changer d'onglet
// ne refetch pas). Les cartes restent les composants présentationnels réutilisables
// de components/console/monitoring/*.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import SubTabs, { type SubTab } from '@/components/console/SubTabs.vue'
import MonitoringWindowPicker from '@/components/console/monitoring/MonitoringWindowPicker.vue'
import ActivationFunnelCard from '@/components/console/monitoring/ActivationFunnelCard.vue'
import ToolCallsCard from '@/components/console/monitoring/ToolCallsCard.vue'
import RestCallsCard from '@/components/console/monitoring/RestCallsCard.vue'
import ConnectorHealthCard from '@/components/console/monitoring/ConnectorHealthCard.vue'
import CallLogCard from '@/components/console/monitoring/CallLogCard.vue'
import {
  getMonitoringSummary, getMonitoringRest, getMonitoringConnectors,
  getMonitoringFunnel, getMonitoringCalls,
} from '@/api/console'
import type {
  MonitoringSummary, MonitoringRestStats, MonitoringConnectorStats, ActivationFunnel, ToolCall,
} from '@/types/api'
import { humanize } from '@/lib/errors'
import { useDeepLink } from '@/composables/useDeepLink'

const Usage = defineAsyncComponent(() => import('./UsageView.vue'))

const TABS = computed<SubTab[]>(() => [
  { key: 'activation', label: 'activation', hint: 'funnel compte ≠ usage' },
  { key: 'mcp', label: 'outils mcp', hint: 'invocations par l’agent' },
  { key: 'rest', label: 'api rest', hint: 'requêtes dashboard & api' },
  { key: 'connecteurs', label: 'connecteurs', hint: 'échecs de résolution de credential' },
  { key: 'journal', label: 'journal', hint: 'appels bruts récents' },
  { key: 'usage', label: 'signaux d’usage', hint: 'déroulés, manques, qualité des outils' },
])
const VALID = computed(() => new Set(TABS.value.map((t) => t.key)))

const dlTab = useDeepLink('tab', (v) => { tab.value = v && VALID.value.has(v) ? v : 'activation' })
const tab = ref(VALID.value.has(dlTab.read() ?? '') ? dlTab.read()! : 'activation')
function select(key: string) {
  tab.value = key
  dlTab.set(key === 'activation' ? null : key)
}

// ── données fenêtrées (toutes les lentilles sauf usage) ──────────────────────
const WINDOWS = [7, 30, 90]
const win = ref(7)
const error = ref<string | null>(null)
const loading = ref(false)
const callsLoaded = ref(false)

const summary = ref<MonitoringSummary | null>(null)
const rest = ref<MonitoringRestStats | null>(null)
const conn = ref<MonitoringConnectorStats | null>(null)
const funnel = ref<ActivationFunnel | null>(null)
const calls = ref<ToolCall[]>([])

// Fenêtre `?win=` (lien partageable ; défaut 7 = param effacé).
const dlWin = useDeepLink('win', (w) => { if (w != null && WINDOWS.includes(w) && w !== win.value) win.value = w }, { parse: Number })
const wInit = dlWin.read(); if (wInit != null && WINDOWS.includes(wInit)) win.value = wInit

async function loadAll() {
  error.value = null
  loading.value = true
  callsLoaded.value = false
  summary.value = null; rest.value = null; conn.value = null; funnel.value = null; calls.value = []
  const w = win.value
  try {
    const [s, r, c, f, cl] = await Promise.all([
      getMonitoringSummary(w),
      getMonitoringRest(w),
      getMonitoringConnectors(w),
      getMonitoringFunnel(w),
      getMonitoringCalls({ limit: 100, days: w }),
    ])
    // Course anti-obsolète : ignorer si la fenêtre a changé entre-temps.
    if (w !== win.value) return
    summary.value = s; rest.value = r; conn.value = c; funnel.value = f; calls.value = cl.calls
  } catch (e) {
    if (w === win.value) error.value = humanize(e)
  } finally {
    if (w === win.value) { loading.value = false; callsLoaded.value = true }
  }
}

watch(win, (w) => { dlWin.set(w === 7 ? null : w); loadAll() }, { immediate: true })
</script>

<template>
  <div class="fadein">
    <SubTabs :tabs="TABS" :model-value="tab" @update:model-value="select" />

    <Usage v-if="tab === 'usage'" />

    <div v-else class="content-inner">
      <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

      <div class="mon-head">
        <MonitoringWindowPicker v-model="win" :windows="WINDOWS" />
        <span class="helptext" style="margin: 0">les sessions stdio non authentifiées apparaissent en anonyme.</span>
      </div>

      <ActivationFunnelCard v-if="tab === 'activation'" :funnel="funnel" :window-days="win" :loading="loading" />

      <ToolCallsCard v-else-if="tab === 'mcp'" :summary="summary" :window-days="win" :loading="loading" link-users />

      <RestCallsCard v-else-if="tab === 'rest'" :rest="rest" :window-days="win" :loading="loading" />

      <ConnectorHealthCard v-else-if="tab === 'connecteurs'" :conn="conn" :window-days="win" :loading="loading" />

      <CallLogCard v-else-if="tab === 'journal'" :calls="calls" :loaded="callsLoaded" :busy="loading" filterable show-user
        sub="les 100 derniers appels d’outils mcp, tous appelants confondus, dans la fenêtre." />
    </div>
  </div>
</template>

<style scoped>
.mon-head {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
</style>
