<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import Quota from '@/components/console/Quota.vue'
import { defineAsyncComponent } from 'vue'
// Unovis lourd → chunk async (les blocs monitoring ne s'affichent qu'aux admins).
const CallsBarChart = defineAsyncComponent(() => import('@/components/console/CallsBarChart.vue'))
import ConnectorHealthGrid from '@/components/console/ConnectorHealthGrid.vue'
import McpEndpointCard from '@/components/console/McpEndpointCard.vue'
import StateEmpty from '@/components/console/StateEmpty.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import InviteFriendCard from '@/components/console/InviteFriendCard.vue'
import ContextPreviewCard from '@/components/console/ContextPreviewCard.vue'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { getConnectors, getDoctrine, getGoogleStatus, getMonitoringSummary, getKbProject, listDocs } from '@/api/console'
import type { ConnectorMeta, GoogleOauthStatus, MonitoringSummary } from '@/types/api'
import { toDayBars } from '@/lib/monitoring'
import { humanize } from '@/lib/errors'

type Variant = 'status' | 'activity'
const explicitPref = localStorage.getItem('oto.overview') as Variant | null
const variant = ref<Variant>(explicitPref || 'status')
function setVariant(v: Variant) { variant.value = v; localStorage.setItem('oto.overview', v) }

const router = useRouter()
const { t } = useI18n()
const { me } = useMe()

const catalog = ref<ConnectorMeta[]>([])
const google = ref<GoogleOauthStatus | null>(null)
const doctrineExists = ref(false)
const hasDocs = ref(false)
const summary = ref<MonitoringSummary | null>(null)
const error = ref<string | null>(null)

// Opérateur plateforme (admin OU super_admin) : voit le résumé monitoring.
const isAdmin = computed(() => isPlatformOperator(me.value))

// ── signaux dérivés de me.providers ──
const keyProviders = computed(() => catalog.value.filter((c) => !c.personal_session && c.secret_kind !== 'none'))
const configuredCount = computed(() =>
  keyProviders.value.filter((c) => {
    const p = me.value?.providers?.[c.name]
    return p && p.mode !== 'forbidden'
  }).length,
)
// L'onboarding « ajoute ta 1ʳᵉ clé » ne compte QUE les clés posées par l'user :
// un provider en pool plateforme (mode 'platform') n'est pas une action de sa part.
const userKeysCount = computed(() =>
  keyProviders.value.filter((c) => me.value?.providers?.[c.name]?.user_key_configured).length,
)
const sessionsActive = computed(() => {
  // Sessions navigateur (brevo/crunchbase, personal_session) configurées + Google.
  let n = catalog.value.filter(
    (c) => c.personal_session && me.value?.providers?.[c.name]?.user_key_configured,
  ).length
  if (google.value?.connected) n++
  return n
})
const errRate = computed(() => {
  const s = summary.value
  return s && s.total_calls ? Math.round((s.error_count / s.total_calls) * 100) : 0
})
const bars = computed(() => (summary.value ? toDayBars(summary.value.by_day, 7) : []))
const callsSpark = computed(() => bars.value.map(([ok, err]) => ok + err))

// Console « quiet » : rien posé, aucune session, aucun appel — état vide éditorial.
const loaded = ref(false)
const isEmpty = computed(() =>
  loaded.value && userKeysCount.value === 0 && sessionsActive.value === 0
  && (!summary.value || summary.value.total_calls === 0))

// ── platform quotas (clés plateforme prêtées, depuis me.providers) ──
const platformQuotas = computed(() =>
  keyProviders.value
    .map((c) => ({ c, p: me.value?.providers?.[c.name] }))
    .filter((x) => x.p?.mode === 'platform' && x.p.quota_daily)
    .map((x) => ({ label: t('overview.quotas.poolSuffix', { label: x.c.label }), used: x.p!.quota_used_today, total: x.p!.quota_daily! })),
)

// ── onboarding (checklist réelle) ──
const steps = computed(() => [
  { done: true, t: t('overview.steps.connectClient.t'), d: t('overview.steps.connectClient.d'), act: null as [string, string] | null },
  { done: userKeysCount.value > 0, t: t('overview.steps.firstKey.t'), d: t('overview.steps.firstKey.d'), act: ['/connectors', t('overview.steps.firstKey.act')] as [string, string] },
  { done: !!google.value?.connected, t: t('overview.steps.google.t'), d: t('overview.steps.google.d'), act: ['/connectors', t('overview.steps.google.act')] as [string, string] },
  { done: hasDocs.value, t: t('overview.steps.kb.t'), d: t('overview.steps.kb.d'), act: ['/documents', t('overview.steps.kb.act')] as [string, string] },
  { done: doctrineExists.value, t: t('overview.steps.readme.t'), d: t('overview.steps.readme.d'), act: ['/org', t('overview.steps.readme.act')] as [string, string] },
  { done: me.value?.active_org != null, t: t('overview.steps.org.t'), d: t('overview.steps.org.d'), act: ['/org', t('overview.steps.org.act')] as [string, string] },
])
const doneCount = computed(() => steps.value.filter((s) => s.done).length)
const nextStep = computed(() => steps.value.find((s) => !s.done))
const nextStepNo = computed(() => steps.value.findIndex((s) => !s.done) + 1)

// Dégrade par carte sans masquer l'échec : le 1er problème s'affiche en bandeau,
// les données qui ont chargé restent visibles (≠ fallback silencieux).
function soft<T>(p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((e) => { error.value = error.value ?? humanize(e); return fallback })
}
onMounted(async () => {
  catalog.value = (await soft(getConnectors(), { connectors: [] })).connectors
  google.value = await soft(getGoogleStatus(), null)
  doctrineExists.value = (await soft(getDoctrine(), null))?.doctrine.exists ?? false
  // KB d'org (zone Documents) : « fait » dès qu'une page de référence existe.
  const kb = await soft(getKbProject(), null)
  if (kb) hasDocs.value = (await soft(listDocs(kb.project_id), { project_id: kb.project_id, docs: [] })).docs.length > 0
  if (isAdmin.value) summary.value = await soft(getMonitoringSummary(7), null)
  loaded.value = true
})
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <div class="eyebrow-row" style="justify-content: space-between">
      <div style="display: flex; align-items: center; gap: 9px">
        <Dot tone="olive" :size="7" />
        <span class="eyebrow">{{ t('overview.eyebrow') }}</span>
      </div>
      <div class="seg">
        <button v-for="v in (['status', 'activity'] as Variant[])" :key="v"
          :class="{ on: variant === v }" @click="setVariant(v)">{{ t('overview.variant.' + v) }}</button>
      </div>
    </div>

    <!-- ── status ── -->
    <template v-if="variant === 'status'">
      <StateEmpty v-if="isEmpty">
        <template #title>{{ t('overview.empty.titlePre') }} <Squiggle>{{ t('overview.empty.titleWord') }}</Squiggle>.</template>
        {{ t('overview.empty.body') }}
        <template #cta>
          <Btn @click="router.push('/connectors')">{{ t('overview.empty.addKey') }}</Btn>
          <Btn kind="ghost" @click="router.push('/projects')">{{ t('overview.empty.openProjects') }}</Btn>
        </template>
      </StateEmpty>
      <template v-else>
        <div :class="summary ? 'grid4' : 'grid3'">
          <Stat :label="t('overview.stat.connectorsLive')" :value="configuredCount" :unit="'/ ' + keyProviders.length" :sub="t('overview.stat.connectorsLiveSub')" />
          <Stat :label="t('overview.stat.sessions')" :value="sessionsActive" unit="/ 2" :sub="t('overview.stat.sessionsSub')" />
          <Stat v-if="summary" :label="t('overview.stat.calls7d')" :value="summary.total_calls.toLocaleString('en-US')" :spark="callsSpark" :sub="t('overview.stat.callsSub', { errors: summary.error_count, rate: errRate })" />
          <Stat :label="t('overview.stat.activeOrg')" :value="me?.active_org_name ?? '—'" :sub="me?.active_org ? t('overview.stat.activeOrgYou', { role: me.org_role }) : t('overview.stat.activeOrgNone')" />
        </div>
        <ContextPreviewCard />
        <div class="grid23">
          <ConnectorHealthGrid />
          <McpEndpointCard />
        </div>
        <InviteFriendCard v-if="me?.access?.status === 'active'" />
        <ConsoleCard v-if="summary" :title="t('overview.callsCard.title')" :sub="t('overview.callsCard.sub')">
          <template #actions>
            <RouterLink class="linklike" to="/platform/monitoring">{{ t('overview.monitoring') }} →</RouterLink>
          </template>
          <CallsBarChart :days="bars" />
        </ConsoleCard>
        <div class="grid23">
          <ConsoleCard v-if="platformQuotas.length" :title="t('overview.quotas.title')" :sub="t('overview.quotas.sub')">
            <div style="display: flex; flex-direction: column; gap: 14px">
              <Quota v-for="q in platformQuotas" :key="q.label" :used="q.used" :total="q.total" :label="q.label" />
            </div>
          </ConsoleCard>
          <div v-else />
          <ConsoleCard :title="t('overview.nextStep.title')" :sub="t('overview.nextStep.sub', { done: doneCount, total: steps.length })">
            <div style="margin-bottom: 4px">
              <Quota :used="doneCount" :total="steps.length" label="" />
            </div>
            <div v-if="nextStep" class="checkstep" style="border-bottom: 0; padding-bottom: 0">
              <span class="ck">{{ nextStepNo }}</span>
              <div style="flex: 1">
                <div class="st-t">{{ nextStep.t }}</div>
                <div class="st-d">{{ nextStep.d }}</div>
                <div v-if="nextStep.act" style="margin-top: 8px">
                  <Btn kind="mini" @click="router.push(nextStep.act[0])">{{ nextStep.act[1] }} →</Btn>
                </div>
              </div>
            </div>
            <Btn v-else kind="mini" @click="router.push('/connectors')">{{ t('overview.nextStep.review') }} →</Btn>
          </ConsoleCard>
        </div>
      </template>
    </template>

    <!-- ── activity (admin: monitoring) ── -->
    <template v-else-if="variant === 'activity'">
      <ConsoleCard v-if="!summary" :title="t('overview.activity.title')">
        <div class="helptext">
          {{ t('overview.activity.adminNotePre') }}
          <RouterLink class="linklike" to="/activity">{{ t('overview.activity.adminNoteLink') }}</RouterLink>.
        </div>
      </ConsoleCard>
      <template v-else>
        <div class="grid3">
          <Stat :label="t('overview.stat.calls7d')" :value="summary.total_calls.toLocaleString('en-US')" :sub="t('overview.stat.activeUsersSub', { n: summary.active_users })" />
          <Stat :label="t('overview.stat.errors')" :value="summary.error_count" :unit="errRate + '%'" tone="var(--color-terra-ink)" :sub="t('overview.stat.errorsSub')" />
          <Stat :label="t('overview.stat.topTool')" :value="summary.by_tool[0]?.tool_name ?? '—'" :sub="t('overview.stat.topToolSub', { n: summary.by_tool[0]?.calls ?? 0 })" />
        </div>
        <ConsoleCard :title="t('overview.callsCard.title')" :sub="t('overview.callsCard.sub')">
          <CallsBarChart :days="bars" />
        </ConsoleCard>
        <div class="grid23">
          <ConsoleCard :title="t('overview.activity.recentTopTools')" flush>
            <template #actions>
              <RouterLink class="linklike" to="/platform/monitoring">{{ t('overview.monitoring') }} →</RouterLink>
            </template>
            <table class="tbl">
              <tbody>
                <tr v-for="row in summary.by_tool.slice(0, 7)" :key="row.tool_name">
                  <td style="width: 18px"><Dot :tone="row.errors ? 'terra' : 'olive'" :size="7" /></td>
                  <td><code class="mono">{{ row.tool_name }}</code></td>
                  <td class="num dim">{{ t('overview.activity.callsCell', { n: row.calls }) }}</td>
                  <td class="num dim">{{ t('overview.activity.errCell', { n: row.errors }) }}</td>
                </tr>
              </tbody>
            </table>
          </ConsoleCard>
          <McpEndpointCard />
        </div>
      </template>
    </template>
  </div>
</template>
