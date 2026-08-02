<script setup lang="ts">
// Supervision plateforme (/platform/monitoring) — point d'entrée UNIQUE de
// l'observabilité, décomposé en SOUS-PAGES `?tab=` (une lentille par onglet, fin de
// la pile de sections — refonte 2026-07-23) :
//   • activation   — funnel COMPTE ≠ USAGE (santé du compte).
//   • mcp          — invocations d'outils par l'agent (KPIs, volume/jour, par outil,
//                    par appelant).
//   • rest         — requêtes /api/* (KPIs, par route).
//   • connecteurs  — échecs de résolution de credential.
//   • journal      — le journal d'appels, FILTRABLE côté serveur (outil, appelant,
//                    lenteur, message d'erreur, déroulé, conversation) et dépliable
//                    en fiche d'appel (corrélation + lien vers le traceback Sentry).
//   • usage        — signaux produit : déroulés, manques, qualité des outils
//                    (panneau UsageView, ex-/platform/usage qui redirige ici).
// Le sélecteur de fenêtre (7/30/90 j, `?win=`) est PARTAGÉ par TOUTES les lentilles,
// signaux d'usage compris. Les stats sont chargées en un Promise.all fenêtré (changer
// d'onglet ne refetch pas) ; le journal a son propre cycle (il dépend des filtres).
// Les cartes restent les composants présentationnels réutilisables de
// components/console/monitoring/*.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import SubTabs, { type SubTab } from '@/components/console/SubTabs.vue'
import MonitoringWindowPicker from '@/components/console/monitoring/MonitoringWindowPicker.vue'
import ActivationFunnelCard from '@/components/console/monitoring/ActivationFunnelCard.vue'
import ToolCallsCard from '@/components/console/monitoring/ToolCallsCard.vue'
import RestCallsCard from '@/components/console/monitoring/RestCallsCard.vue'
import ConnectorHealthCard from '@/components/console/monitoring/ConnectorHealthCard.vue'
import CallLogCard from '@/components/console/monitoring/CallLogCard.vue'
import CallLogFilters, { type CallFilters } from '@/components/console/monitoring/CallLogFilters.vue'
import {
  getMonitoringSummary, getMonitoringRest, getMonitoringConnectors,
  getMonitoringFunnel, getMonitoringCalls, getMonitoringCall,
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
  { key: 'journal', label: 'journal', hint: 'appels bruts, filtrables' },
  { key: 'usage', label: 'signaux d’usage', hint: 'déroulés, manques, qualité des outils' },
])
const VALID = computed(() => new Set(TABS.value.map((t) => t.key)))

const dlTab = useDeepLink('tab', (v) => { tab.value = v && VALID.value.has(v) ? v : 'activation' })
const tab = ref(VALID.value.has(dlTab.read() ?? '') ? dlTab.read()! : 'activation')
function select(key: string) {
  tab.value = key
  dlTab.set(key === 'activation' ? null : key)
}

// ── données fenêtrées ────────────────────────────────────────────────────────
const WINDOWS = [7, 30, 90]
const win = ref(7)
const error = ref<string | null>(null)
const loading = ref(false)

const summary = ref<MonitoringSummary | null>(null)
const rest = ref<MonitoringRestStats | null>(null)
const conn = ref<MonitoringConnectorStats | null>(null)
const funnel = ref<ActivationFunnel | null>(null)

// Fenêtre `?win=` (lien partageable ; défaut 7 = param effacé).
const dlWin = useDeepLink('win', (w) => { if (w != null && WINDOWS.includes(w) && w !== win.value) win.value = w }, { parse: Number })
const wInit = dlWin.read(); if (wInit != null && WINDOWS.includes(wInit)) win.value = wInit

async function loadStats() {
  error.value = null
  loading.value = true
  summary.value = null; rest.value = null; conn.value = null; funnel.value = null
  const w = win.value
  try {
    const [s, r, c, f] = await Promise.all([
      getMonitoringSummary(w),
      getMonitoringRest(w),
      getMonitoringConnectors(w),
      getMonitoringFunnel(w),
    ])
    // Course anti-obsolète : ignorer si la fenêtre a changé entre-temps.
    if (w !== win.value) return
    summary.value = s; rest.value = r; conn.value = c; funnel.value = f
  } catch (e) {
    if (w === win.value) error.value = humanize(e)
  } finally {
    if (w === win.value) loading.value = false
  }
}

// ── journal : cycle propre (fenêtre × filtres serveur) ───────────────────────
const filters = ref<CallFilters>({})
const calls = ref<ToolCall[]>([])
const callsLoaded = ref(false)
const callsBusy = ref(false)
let callsSeq = 0

async function loadCalls() {
  const seq = ++callsSeq
  callsBusy.value = true
  try {
    const res = await getMonitoringCalls({ limit: 200, days: win.value, ...filters.value })
    if (seq !== callsSeq) return          // réponse d'une requête périmée
    calls.value = res.calls
    callsLoaded.value = true
  } catch (e) {
    if (seq === callsSeq) { error.value = humanize(e); callsLoaded.value = true }
  } finally {
    if (seq === callsSeq) callsBusy.value = false
  }
}

// Un axe cliqué dans une fiche d'appel refiltre le journal dessus (drill-down :
// « et le reste de ce déroulé ? », « et les autres appels de cette personne ? »).
function applyAxis(axis: 'run_id' | 'session_id' | 'sub' | 'tool', value: string) {
  filters.value = { ...filters.value, [axis]: value }
}

const hasFilters = computed(() => Object.keys(filters.value).length > 0)

watch(win, (w) => { dlWin.set(w === 7 ? null : w); loadStats(); loadCalls() }, { immediate: true })
watch(filters, loadCalls, { deep: true })
</script>

<template>
  <div class="fadein">
    <SubTabs :tabs="TABS" :model-value="tab" @update:model-value="select" />

    <Usage v-if="tab === 'usage'" :window-days="win" />

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

      <template v-else-if="tab === 'journal'">
        <CallLogFilters v-model="filters" />
        <CallLogCard :calls="calls" :loaded="callsLoaded" :busy="callsBusy" filterable show-user
          :load-detail="(id: number) => getMonitoringCall(id).then((r) => r.call)"
          :sub="hasFilters
            ? 'appels correspondant aux filtres, dans la fenêtre — clique une ligne pour sa fiche.'
            : 'les 200 derniers appels d’outils mcp, tous appelants confondus, dans la fenêtre — clique une ligne pour sa fiche.'"
          :empty-label="hasFilters ? 'aucun appel ne correspond à ces filtres.' : 'aucun appel dans la fenêtre'"
          @filter="applyAxis" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.mon-head {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
</style>
