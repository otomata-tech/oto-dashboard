<script setup lang="ts">
// Signaux d'usage d'une ORG (onglet de OrgMonitoringView) : ce que les membres de
// cette org ont remonté — manques (`gap` : oto n'a pas su faire) et qualité des
// outils (`tool_feedback`). Pendant org de UsageView.
//
// Pas de drill-down sur les signaux bruts ici : le corps d'un signal est de la prose
// libre écrite par un agent, servie par une capacité PLATEFORME (`usage.signals`).
// L'étage org n'expose que les agrégats — un tableau qui se déplie sur du vide serait
// pire qu'un tableau qui ne se déplie pas.
import { ref, watch } from 'vue'
import SignalAggCard, { type SignalAggRow } from '@/components/console/monitoring/SignalAggCard.vue'
import { getOrgUsageGaps, getOrgUsageToolQuality } from '@/api/console'
import { humanize } from '@/lib/errors'

const props = defineProps<{ orgId: number; windowDays: number }>()

const gaps = ref<SignalAggRow[]>([])
const tools = ref<SignalAggRow[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

const GAP_TONE = { missing_tool: 'saffron', missing_doctrine: 'saffron', missing_data: 'saffron' } as const
const FEEDBACK_TONE = {
  praise: 'olive', bug: 'terra', wrong_result: 'terra', misleading_doc: 'saffron',
} as const

async function load() {
  const { orgId, windowDays } = props
  loaded.value = false
  try {
    const [g, t] = await Promise.all([
      getOrgUsageGaps(orgId, windowDays),
      getOrgUsageToolQuality(orgId, windowDays),
    ])
    if (orgId !== props.orgId || windowDays !== props.windowDays) return  // réponse périmée
    gaps.value = g.gaps.map((x) => ({ label: x.intent, kind: x.kind, n: x.n, last_at: x.last_at, users: x.users }))
    tools.value = t.tools.map((x) => ({ label: x.tool, kind: x.kind, n: x.n, last_at: x.last_at, users: x.users }))
    error.value = null
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
watch(() => [props.orgId, props.windowDays], load, { immediate: true })
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="grid2">
      <SignalAggCard title="manques signalés"
        :sub="`ce que tes membres ont voulu faire et qu'oto n'a pas couvert · ${windowDays} j`"
        :rows="gaps" :loaded="loaded" label-head="besoin" kind-head="type"
        :tones="GAP_TONE" default-tone="saffron"
        empty="aucun manque signalé — tes membres n'ont rien remonté sur la période." />

      <SignalAggCard title="qualité des outils"
        :sub="`retours de tes membres sur les outils utilisés · ${windowDays} j`"
        :rows="tools" :loaded="loaded" label-head="outil" kind-head="verdict" mono
        :tones="FEEDBACK_TONE"
        empty="aucun retour d'outil sur la période." />
    </div>
  </div>
</template>
