<script setup lang="ts">
// Supervision plateforme, onglet SANTÉ (panneau de MonitoringView, 2026-07-23) :
// funnel + MCP + REST + connecteurs + journal brut empilés, tout visible d'un coup.
// Les sections sont des composants RÉUTILISABLES (components/console/monitoring/*),
// purement présentationnels (données par prop) → prêts à être branchés dans les fiches
// admin org / équipe / user quand le backend scopera les agrégats (aujourd'hui la
// plateforme est globale, cf. oto-backend §Monitoring). Le journal brut, lui, sait déjà
// filtrer par `sub` (fiche user admin).
import { ref, watch } from 'vue'
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

// Fenêtre `?win=` (lien partageable ; défaut 7 = param effacé). Plus de `?tab=` — la
// page n'a plus d'onglets.
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
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="mon-head">
      <MonitoringWindowPicker v-model="win" :windows="WINDOWS" />
      <span class="helptext" style="margin: 0">les sessions stdio non authentifiées apparaissent en anonyme.</span>
    </div>

    <!-- COMPTE ≠ USAGE : santé du compte, toujours en tête. -->
    <ActivationFunnelCard :funnel="funnel" :window-days="win" :loading="loading" />

    <div class="eyebrow" style="margin-top: 4px">outils mcp · l’agent en action</div>
    <ToolCallsCard :summary="summary" :window-days="win" :loading="loading" link-users />

    <div class="eyebrow" style="margin-top: 4px">api rest · requêtes dashboard &amp; api</div>
    <RestCallsCard :rest="rest" :window-days="win" :loading="loading" />

    <div class="eyebrow" style="margin-top: 4px">connecteurs · résolution de credential</div>
    <ConnectorHealthCard :conn="conn" :window-days="win" :loading="loading" />

    <div class="eyebrow" style="margin-top: 4px">appels récents · journal brut</div>
    <CallLogCard :calls="calls" :loaded="callsLoaded" :busy="loading" filterable
      sub="les 100 derniers appels d’outils mcp, tous appelants confondus, dans la fenêtre." />
  </div>
</template>

<style scoped>
.mon-head {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
</style>
