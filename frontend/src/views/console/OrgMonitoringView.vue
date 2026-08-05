<script setup lang="ts">
// Supervision de MON org (/org/monitoring) — l'étage manquant entre « mon activité »
// (/activity, ce que J'AI fait) et /platform/monitoring (toute la plateforme, opérateur).
// Réservé à l'org_admin : c'est lui qui répond de l'adoption, des blocages et des manques
// de son équipe.
//
// Mêmes cartes que la supervision plateforme, mêmes lentilles côté backend
// (`capabilities/org_monitoring.py`) — seul le SCOPE change : tout est borné à ce qui a
// été émis SOUS cette org (`tool_calls.org_id`), jamais à l'appartenance des membres.
// Deux lentilles plateforme n'y sont pas (api rest, funnel de toute la base : santé
// d'infra) ; une n'existe qu'ici : `adoption`, membre par membre.
//
// ⚠ L'org visée est passée EXPLICITEMENT dans l'URL (`/api/orgs/{id}/…`), jamais déduite
// d'un header de consultation — le scope d'une lecture nominative doit se lire dans le
// chemin.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import SubTabs, { type SubTab } from '@/components/console/SubTabs.vue'
import MonitoringWindowPicker from '@/components/console/monitoring/MonitoringWindowPicker.vue'
import OrgAdoptionCard from '@/components/console/monitoring/OrgAdoptionCard.vue'
import ToolCallsCard from '@/components/console/monitoring/ToolCallsCard.vue'
import ConnectorHealthCard from '@/components/console/monitoring/ConnectorHealthCard.vue'
import CallLogCard from '@/components/console/monitoring/CallLogCard.vue'
import CallLogFilters, { type CallFilters } from '@/components/console/monitoring/CallLogFilters.vue'
import {
  getOrgAdoption, getOrgMonitoringSummary, getOrgMonitoringConnectors,
  getOrgMonitoringCalls, getOrgMonitoringCall,
} from '@/api/console'
import type { MonitoringSummary, MonitoringConnectorStats, OrgAdoption, ToolCall } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useDeepLink } from '@/composables/useDeepLink'
import { useOrgScope } from '@/composables/useOrgScope'

const OrgSignals = defineAsyncComponent(() => import('./OrgSignalsView.vue'))

const { activeOrgId, loaded: orgLoaded, isOrgAdmin, error: orgError } = useOrgScope()

const TABS = computed<SubTab[]>(() => [
  { key: 'adoption', label: 'adoption', hint: 'qui dans l’équipe s’en sert' },
  { key: 'mcp', label: 'outils mcp', hint: 'invocations par l’agent' },
  { key: 'connecteurs', label: 'connecteurs', hint: 'ce qui bloque tes membres' },
  { key: 'journal', label: 'journal', hint: 'appels bruts, filtrables' },
  { key: 'signaux', label: 'signaux d’usage', hint: 'manques et qualité remontés par tes membres' },
])
const VALID = computed(() => new Set(TABS.value.map((t) => t.key)))

const dlTab = useDeepLink('tab', (v) => { tab.value = v && VALID.value.has(v) ? v : 'adoption' })
const tab = ref(VALID.value.has(dlTab.read() ?? '') ? dlTab.read()! : 'adoption')
function select(key: string) {
  tab.value = key
  dlTab.set(key === 'adoption' ? null : key)
}

// ── données fenêtrées ────────────────────────────────────────────────────────
const WINDOWS = [7, 30, 90]
const win = ref(7)
const error = ref<string | null>(null)
const loading = ref(false)

const adoption = ref<OrgAdoption | null>(null)
const summary = ref<MonitoringSummary | null>(null)
const conn = ref<MonitoringConnectorStats | null>(null)

const dlWin = useDeepLink('win', (w) => { if (w != null && WINDOWS.includes(w) && w !== win.value) win.value = w }, { parse: Number })
const wInit = dlWin.read(); if (wInit != null && WINDOWS.includes(wInit)) win.value = wInit

async function loadStats() {
  const orgId = activeOrgId.value
  if (orgId == null || !isOrgAdmin.value) return
  error.value = null
  loading.value = true
  adoption.value = null; summary.value = null; conn.value = null
  const w = win.value
  try {
    const [a, s, c] = await Promise.all([
      getOrgAdoption(orgId, w),
      getOrgMonitoringSummary(orgId, w),
      getOrgMonitoringConnectors(orgId, w),
    ])
    // Course anti-obsolète : ignorer si la fenêtre (ou l'org) a changé entre-temps.
    if (w !== win.value || orgId !== activeOrgId.value) return
    adoption.value = a; summary.value = s; conn.value = c
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
  const orgId = activeOrgId.value
  if (orgId == null || !isOrgAdmin.value) return
  const seq = ++callsSeq
  callsBusy.value = true
  try {
    const res = await getOrgMonitoringCalls(orgId, { limit: 200, days: win.value, ...filters.value })
    if (seq !== callsSeq) return          // réponse d'une requête périmée
    calls.value = res.calls
    callsLoaded.value = true
  } catch (e) {
    if (seq === callsSeq) { error.value = humanize(e); callsLoaded.value = true }
  } finally {
    if (seq === callsSeq) callsBusy.value = false
  }
}

// Un axe cliqué dans une fiche d'appel refiltre le journal dessus (même drill-down
// qu'en plateforme, borné à l'org).
function applyAxis(axis: 'run_id' | 'session_id' | 'sub' | 'tool', value: string) {
  filters.value = { ...filters.value, [axis]: value }
}
const hasFilters = computed(() => Object.keys(filters.value).length > 0)

const loadCallDetail = (id: number) =>
  getOrgMonitoringCall(activeOrgId.value as number, id).then((r) => r.call)

watch(win, (w) => { dlWin.set(w === 7 ? null : w); loadStats(); loadCalls() }, { immediate: true })
watch(filters, loadCalls, { deep: true })
// Bascule d'org (consultation) : tout est org-scopé, on recharge.
watch([activeOrgId, isOrgAdmin], () => { loadStats(); loadCalls() })
</script>

<template>
  <div class="fadein">
    <p v-if="orgError" class="helptext" style="color: var(--color-terra-ink)">{{ orgError }}</p>

    <ConsoleCard v-if="orgLoaded && activeOrgId == null" title="aucune org active">
      <div class="helptext">tu n'es dans aucune organisation pour le moment.</div>
    </ConsoleCard>

    <ConsoleCard v-else-if="orgLoaded && !isOrgAdmin" title="réservé aux admins de l'org">
      <div class="helptext">
        cette page montre l'activité de tous les membres — seul un admin de l'org y accède.
        Ta propre activité reste visible sur <RouterLink to="/activity">ton activité</RouterLink>.
      </div>
    </ConsoleCard>

    <template v-else-if="activeOrgId != null">
      <SubTabs :tabs="TABS" :model-value="tab" @update:model-value="select" />

      <OrgSignals v-if="tab === 'signaux'" :org-id="activeOrgId" :window-days="win" />

      <div v-else class="content-inner">
        <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

        <div class="mon-head">
          <MonitoringWindowPicker v-model="win" :windows="WINDOWS" />
          <span class="helptext" style="margin: 0">
            seuls les appels émis sous cette org sont comptés.
          </span>
        </div>

        <OrgAdoptionCard v-if="tab === 'adoption'" :adoption="adoption" :window-days="win" :loading="loading" />

        <ToolCallsCard v-else-if="tab === 'mcp'" :summary="summary" :window-days="win" :loading="loading" />

        <ConnectorHealthCard v-else-if="tab === 'connecteurs'" :conn="conn" :window-days="win" :loading="loading" />

        <template v-else-if="tab === 'journal'">
          <CallLogFilters v-model="filters" />
          <CallLogCard :calls="calls" :loaded="callsLoaded" :busy="callsBusy" filterable show-user
            :load-detail="loadCallDetail"
            :sub="hasFilters
              ? 'appels correspondant aux filtres, dans la fenêtre — clique une ligne pour sa fiche.'
              : 'les 200 derniers appels d’outils de ton org, tous membres confondus — clique une ligne pour sa fiche.'"
            :empty-label="hasFilters ? 'aucun appel ne correspond à ces filtres.' : 'aucun appel dans la fenêtre'"
            @filter="applyAxis" />
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mon-head {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
</style>
