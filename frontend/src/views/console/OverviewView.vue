<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import Quota from '@/components/console/Quota.vue'
import DayBars from '@/components/console/DayBars.vue'
import ConnectorHealthGrid from '@/components/console/ConnectorHealthGrid.vue'
import McpEndpointCard from '@/components/console/McpEndpointCard.vue'
import StateEmpty from '@/components/console/StateEmpty.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import InviteFriendCard from '@/components/console/InviteFriendCard.vue'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { getConnectors, getDoctrine, getGoogleStatus, getMonitoringSummary } from '@/api/console'
import type { ConnectorMeta, GoogleOauthStatus, MonitoringSummary } from '@/types/api'
import { toDayBars } from '@/lib/monitoring'
import { humanize } from '@/lib/errors'

type Variant = 'status' | 'activity'
const VARIANT_LABEL: Record<Variant, string> = { status: 'status', activity: 'activity' }
const explicitPref = localStorage.getItem('oto.overview') as Variant | null
const variant = ref<Variant>(explicitPref || 'status')
function setVariant(v: Variant) { variant.value = v; localStorage.setItem('oto.overview', v) }

const router = useRouter()
const { me } = useMe()

const catalog = ref<ConnectorMeta[]>([])
const google = ref<GoogleOauthStatus | null>(null)
const doctrineExists = ref(false)
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
    .map((x) => ({ label: `${x.c.label} · platform pool`, used: x.p!.quota_used_today, total: x.p!.quota_daily! })),
)

// ── onboarding (checklist réelle) ──
const steps = computed(() => [
  { done: true, t: 'connect a client', d: 'add mcp.oto.ninja to claude desktop, cursor or any mcp client — auth runs over oauth.', act: null as [string, string] | null },
  { done: userKeysCount.value > 0, t: 'add your first api key', d: 'paste a provider key (serper, hunter, …) so your tools can call out.', act: ['/connectors', 'add a key'] as [string, string] },
  { done: !!google.value?.connected, t: 'link google workspace', d: 'unlock gmail, drive, sheets and the datastore.', act: ['/connectors', 'link google'] as [string, string] },
  { done: !!me.value?.memento?.connected, t: 'connect your knowledge base', d: 'link memento — a structured, sourced memory your agents read and write across sessions. federated into every oto session.', act: ['/connectors', 'connect memento'] as [string, string] },
  { done: doctrineExists.value, t: 'write your doctrine', d: 'one markdown file your agents read before acting. crm rules, tone, guardrails.', act: ['/doctrine', 'open the editor'] as [string, string] },
  { done: me.value?.active_org != null, t: 'join an organization', d: 'share org keys so teammates inherit your setup.', act: ['/org', 'manage organization'] as [string, string] },
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
        <span class="eyebrow">studio open · all systems nominal</span>
      </div>
      <div class="seg">
        <button v-for="v in (['status', 'activity'] as Variant[])" :key="v"
          :class="{ on: variant === v }" @click="setVariant(v)">{{ VARIANT_LABEL[v] }}</button>
      </div>
    </div>

    <!-- ── status ── -->
    <template v-if="variant === 'status'">
      <StateEmpty v-if="isEmpty">
        <template #title>your console is <Squiggle>quiet</Squiggle>.</template>
        no tools have run yet. connect a client, add a provider key, and your agents start
        showing up here — calls, quotas, errors, the lot.
        <template #cta>
          <Btn @click="router.push('/connectors')">add a key</Btn>
          <Btn kind="ghost" @click="router.push('/projects')">open your projects</Btn>
        </template>
      </StateEmpty>
      <template v-else>
        <div :class="summary ? 'grid4' : 'grid3'">
          <Stat label="connectors live" :value="configuredCount" :unit="'/ ' + keyProviders.length" sub="api keys resolvable for your tools" />
          <Stat label="sessions" :value="sessionsActive" unit="/ 2" sub="crunchbase · google" />
          <Stat v-if="summary" label="calls · 7 days" :value="summary.total_calls.toLocaleString('en-US')" :spark="callsSpark" :sub="`${summary.error_count} errors · ${errRate}%`" />
          <Stat label="active org" :value="me?.active_org_name ?? '—'" :sub="me?.active_org ? `you · ${me.org_role}` : 'no active org'" />
        </div>
        <div class="grid23">
          <ConnectorHealthGrid />
          <McpEndpointCard />
        </div>
        <InviteFriendCard v-if="me?.access?.status === 'active'" />
        <ConsoleCard v-if="summary" title="calls · last 7 days" sub="terra segments are failures.">
          <template #actions>
            <RouterLink class="linklike" to="/platform/monitoring">monitoring →</RouterLink>
          </template>
          <DayBars :days="bars" />
        </ConsoleCard>
        <div class="grid23">
          <ConsoleCard v-if="platformQuotas.length" title="shared quotas" sub="platform keys you use, with today's burn.">
            <div style="display: flex; flex-direction: column; gap: 14px">
              <Quota v-for="q in platformQuotas" :key="q.label" :used="q.used" :total="q.total" :label="q.label" />
            </div>
          </ConsoleCard>
          <div v-else />
          <ConsoleCard title="next step" :sub="`${doneCount} of ${steps.length} done — finish setting up.`">
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
            <Btn v-else kind="mini" @click="router.push('/connectors')">review setup →</Btn>
          </ConsoleCard>
        </div>
      </template>
    </template>

    <!-- ── activity (admin: monitoring) ── -->
    <template v-else-if="variant === 'activity'">
      <ConsoleCard v-if="!summary" title="activity">
        <div class="helptext">
          aggregate activity is a platform-admin view. see your own tool calls under
          <RouterLink class="linklike" to="/activity">activity</RouterLink>.
        </div>
      </ConsoleCard>
      <template v-else>
        <div class="grid3">
          <Stat label="calls · 7 days" :value="summary.total_calls.toLocaleString('en-US')" :sub="`${summary.active_users} active users`" />
          <Stat label="errors" :value="summary.error_count" :unit="errRate + '%'" tone="var(--color-terra-ink)" sub="across all callers" />
          <Stat label="top tool" :value="summary.by_tool[0]?.tool_name ?? '—'" :sub="`${summary.by_tool[0]?.calls ?? 0} calls`" />
        </div>
        <ConsoleCard title="calls · last 7 days" sub="terra segments are failures.">
          <DayBars :days="bars" />
        </ConsoleCard>
        <div class="grid23">
          <ConsoleCard title="recent · top tools" flush>
            <template #actions>
              <RouterLink class="linklike" to="/platform/monitoring">monitoring →</RouterLink>
            </template>
            <table class="tbl">
              <tbody>
                <tr v-for="t in summary.by_tool.slice(0, 7)" :key="t.tool_name">
                  <td style="width: 18px"><Dot :tone="t.errors ? 'terra' : 'olive'" :size="7" /></td>
                  <td><code class="mono">{{ t.tool_name }}</code></td>
                  <td class="num dim">{{ t.calls }} calls</td>
                  <td class="num dim">{{ t.errors }} err</td>
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
