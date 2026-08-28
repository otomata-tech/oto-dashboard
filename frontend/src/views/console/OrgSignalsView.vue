<script setup lang="ts">
// Signaux d'usage d'une ORG (onglet de OrgMonitoringView) : ce que les membres de
// cette org ont remonté — manques (`gap` : oto n'a pas su faire) et qualité des
// outils (`tool_feedback`). Pendant org de UsageView.
//
// ⚠️ CE COMMENTAIRE ÉTAIT VRAI JUSQU'AU 27/08, IL NE L'EST PLUS. Il disait « pas de
// drill-down : le corps est servi par une capacité PLATEFORME, l'étage org n'expose
// que les agrégats ». L'étage org sert désormais les signaux BRUTS —
// `GET /api/orgs/{id}/monitoring/signals` (autz org_admin, `resolved_by` retiré).
//
// Le manque a coûté cinq jours à cinq clients d'un revendeur : leur ingestion
// quotidienne échouait chaque matin, leurs responsables voyaient « 8 manques » et ne
// pouvaient pas savoir lesquels — alors que la prose disait « le projet de destination
// a été archivé le 21/08 », une cause qu'aucun compteur ne porte.
//
// Cet écran, lui, n'affiche TOUJOURS que les agrégats : la vue existe côté serveur,
// pas encore ici. C'est un manque d'écran, plus une décision de produit.
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
