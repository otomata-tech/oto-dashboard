<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import Icon from '@/components/console/Icon.vue'
import Quota from '@/components/console/Quota.vue'
import DayBars from '@/components/console/DayBars.vue'
import ConnectorHealthGrid from '@/components/console/ConnectorHealthGrid.vue'
import McpEndpointCard from '@/components/console/McpEndpointCard.vue'
import { useMe } from '@/composables/useMe'
import { getConnectors, getDoctrine, getGoogleStatus, getMonitoringSummary } from '@/api/console'
import type { ConnectorMeta, GoogleOauthStatus, MonitoringSummary } from '@/types/api'
import { toDayBars } from '@/lib/monitoring'

type Variant = 'status' | 'activity' | 'onboarding'
const variant = ref<Variant>((localStorage.getItem('oto.overview') as Variant) || 'status')
function setVariant(v: Variant) { variant.value = v; localStorage.setItem('oto.overview', v) }

const router = useRouter()
const { me } = useMe()

const catalog = ref<ConnectorMeta[]>([])
const google = ref<GoogleOauthStatus | null>(null)
const doctrineExists = ref(false)
const summary = ref<MonitoringSummary | null>(null)

const isAdmin = computed(() => me.value?.role === 'admin')

// ── signaux dérivés de me.providers ──
const keyProviders = computed(() => catalog.value.filter((c) => !c.personal_session && c.secret_kind !== 'none'))
const configuredCount = computed(() =>
  keyProviders.value.filter((c) => {
    const p = me.value?.providers?.[c.name]
    return p && p.mode !== 'forbidden'
  }).length,
)
const sessionsActive = computed(() => {
  let n = 0
  if (me.value?.linkedin.configured) n++
  if (me.value?.crunchbase.configured) n++
  if (google.value?.connected) n++
  return n
})
const errRate = computed(() => {
  const s = summary.value
  return s && s.total_calls ? Math.round((s.error_count / s.total_calls) * 100) : 0
})
const bars = computed(() => (summary.value ? toDayBars(summary.value.by_day, 7) : []))

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
  { done: configuredCount.value > 0, t: 'add your first api key', d: 'paste a provider key (serper, hunter, …) so your tools can call out.', act: ['connectors', 'add a key'] as [string, string] },
  { done: !!google.value?.connected, t: 'link google workspace', d: 'unlock gmail, drive, sheets and the datastore.', act: ['connectors', 'link google'] as [string, string] },
  { done: doctrineExists.value, t: 'write your doctrine', d: 'one markdown file your agents read before acting. crm rules, tone, guardrails.', act: ['doctrine', 'open the editor'] as [string, string] },
  { done: me.value?.active_org != null, t: 'join an organization', d: 'share org keys so teammates inherit your setup.', act: ['org', 'manage organization'] as [string, string] },
])
const doneCount = computed(() => steps.value.filter((s) => s.done).length)

onMounted(async () => {
  catalog.value = (await getConnectors().catch(() => ({ connectors: [] }))).connectors
  google.value = await getGoogleStatus().catch(() => null)
  doctrineExists.value = (await getDoctrine().catch(() => null))?.doctrine.exists ?? false
  if (isAdmin.value) summary.value = await getMonitoringSummary(7).catch(() => null)
})
</script>

<template>
  <div class="content-inner fadein">
    <div class="eyebrow-row" style="justify-content: flex-end">
      <div class="seg">
        <button v-for="v in (['status', 'activity', 'onboarding'] as Variant[])" :key="v"
          :class="{ on: variant === v }" @click="setVariant(v)">{{ v }}</button>
      </div>
    </div>

    <!-- ── status ── -->
    <template v-if="variant === 'status'">
      <div class="grid3">
        <Stat label="connectors live" :value="configuredCount" :unit="'/ ' + keyProviders.length" sub="api keys resolvable for your tools" />
        <Stat label="sessions" :value="sessionsActive" unit="/ 3" sub="linkedin · crunchbase · google" />
        <Stat v-if="summary" label="calls · 7 days" :value="summary.total_calls.toLocaleString('en-US')" :sub="`${summary.error_count} errors (${errRate}%)`" />
        <Stat v-else label="your account" :value="me?.role ?? '—'" :sub="me?.active_org_name ? 'org · ' + me.active_org_name : 'no active org'" />
      </div>
      <div class="grid23">
        <ConnectorHealthGrid />
        <McpEndpointCard />
      </div>
      <div v-if="platformQuotas.length" class="grid23">
        <ConsoleCard title="shared quotas" sub="platform keys you use, with today's burn.">
          <div style="display: flex; flex-direction: column; gap: 14px">
            <Quota v-for="q in platformQuotas" :key="q.label" :used="q.used" :total="q.total" :label="q.label" />
          </div>
        </ConsoleCard>
        <ConsoleCard title="next step" sub="finish setting up.">
          <Btn kind="mini" @click="setVariant('onboarding')">open the checklist →</Btn>
        </ConsoleCard>
      </div>
    </template>

    <!-- ── activity (admin: monitoring) ── -->
    <template v-else-if="variant === 'activity'">
      <ConsoleCard v-if="!summary" title="activity">
        <div class="helptext">
          aggregate activity is a platform-admin view. see your own tool calls under
          <RouterLink class="linklike" to="/console/activity">activity</RouterLink>.
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
              <RouterLink class="linklike" to="/console/monitoring">monitoring →</RouterLink>
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

    <!-- ── onboarding ── -->
    <template v-else>
      <div class="grid32">
        <ConsoleCard title="getting set up" :sub="`${doneCount} of ${steps.length} done`">
          <div style="margin-bottom: 6px">
            <Quota :used="doneCount" :total="steps.length" label="setup progress" />
          </div>
          <div v-for="(s, i) in steps" :key="i" class="checkstep" :class="{ done: s.done }">
            <span class="ck">
              <Icon v-if="s.done" name="check" :size="11" :sw="2.5" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            <div style="flex: 1">
              <div class="st-t">{{ s.t }}</div>
              <div class="st-d">{{ s.d }}</div>
              <div v-if="s.act && !s.done" style="margin-top: 7px">
                <Btn kind="mini" @click="router.push(`/console/${s.act[0]}`)">{{ s.act[1] }}</Btn>
              </div>
            </div>
          </div>
        </ConsoleCard>
        <div style="display: flex; flex-direction: column; gap: 16px">
          <McpEndpointCard />
        </div>
      </div>
      <ConnectorHealthGrid />
    </template>
  </div>
</template>
