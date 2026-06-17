<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt, type PromptField } from '@/composables/usePrompt'
import {
  getAdminUser, setUserRole, getPlatformKeys, getConnectors, getMonitoringCalls,
  grantPlatformKey, revokePlatformKey, grantNamespace, revokeNamespaceGrant, resendAlphaInvite,
  setAdminOrgMemberRole,
} from '@/api/console'
import type {
  AdminGrant, AdminUserDetail, AdminUserOrg, ConnectorMeta, NamespaceGrant, PlatformKey, ProviderStatus, ToolCall,
} from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const route = useRoute()
const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()

const sub = computed(() => String(route.params.sub))
const detail = ref<AdminUserDetail | null>(null)
const keys = ref<PlatformKey[]>([])
const catalog = ref<ConnectorMeta[]>([])
const calls = ref<ToolCall[]>([])
const error = ref<string | null>(null)
const callsBusy = ref(false)

const isAdmin = computed(() => detail.value?.role === 'admin')
const accessStatus = computed(() => detail.value?.access_status ?? null)
// On propose le renvoi tant que l'accès n'est pas actif (waitlist/pending ou bloqué),
// ou s'il reste une invitation en attente pour son email.
const canResend = computed(() =>
  !!detail.value?.email && (accessStatus.value !== 'active' || !!detail.value?.pending_invite))
const callsErrCount = computed(() => calls.value.filter((c) => !c.ok).length)
// Accès effectif par provider keyé (la question « a-t-il déjà accès ? »).
const providerRows = computed(() =>
  Object.entries(detail.value?.providers ?? {})
    .filter((e): e is [string, ProviderStatus] => !!e[1])
    .sort((a, b) => a[0].localeCompare(b[0])),
)
const nsOptions = computed(() =>
  [...new Set(catalog.value.filter((c) => c.availability === 'platform_granted').flatMap((c) => c.namespaces))],
)

function access(p: ProviderStatus): { text: string; tone?: 'olive' | 'cobalt' | 'saffron' | 'terra' } {
  switch (p.mode) {
    case 'user': return { text: 'own key', tone: 'olive' }
    case 'group': return { text: 'via team', tone: 'cobalt' }
    case 'org': return { text: 'via org', tone: 'cobalt' }
    case 'platform': return { text: `platform · ${p.quota_used_today}/${p.quota_daily ?? '∞'}`, tone: 'saffron' }
    case 'over_quota': return { text: 'platform · quota exhausted', tone: 'terra' }
    default: return { text: 'no access' }
  }
}

async function loadDetail() {
  try { detail.value = await getAdminUser(sub.value) }
  catch (e) { error.value = humanize(e) }
}
async function loadActivity() {
  callsBusy.value = true
  try { calls.value = (await getMonitoringCalls({ sub: sub.value, limit: 100, days: 30 })).calls }
  catch { /* activité best-effort, ne bloque pas la fiche */ }
  finally { callsBusy.value = false }
}
async function loadStatic() {
  keys.value = (await getPlatformKeys().catch(() => ({ platform_keys: [] }))).platform_keys
  catalog.value = (await getConnectors().catch(() => ({ connectors: [] }))).connectors
}
function loadAll() { error.value = null; loadDetail(); loadActivity(); loadStatic() }
onMounted(loadAll)
watch(sub, loadAll)

const resending = ref(false)
async function resendInvite() {
  if (!detail.value?.email) return
  resending.value = true
  try {
    const res = await resendAlphaInvite(detail.value.email)
    if (res.emailed) {
      toast(`invitation re-sent to ${res.email}`)
    } else {
      await promptForm({
        title: 'share this invitation link',
        description: 'email delivery is off on this server — copy and send it yourself.',
        fields: [{ key: 'url', label: 'invitation link', value: res.invite_url }],
        submitLabel: 'done',
      })
    }
    await loadDetail()
  } catch (e) { toast(humanize(e)) } finally { resending.value = false }
}

async function toggleAdmin() {
  const next = isAdmin.value ? 'member' : 'admin'
  const msg = isAdmin.value
    ? 'remove platform admin from this user?'
    : 'make this user a platform admin? they get the full platform · admin section.'
  if (!await confirmAction({ title: 'platform role', danger: isAdmin.value, confirmLabel: next === 'admin' ? 'make admin' : 'remove admin', message: msg })) return
  try { await setUserRole(sub.value, next); toast(`role → ${next}`); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}

const grantFor = (provider: string) => detail.value?.grants.find((g) => g.provider === provider)
const platformKeysFor = (provider: string) => keys.value.filter((k) => k.provider === provider)

async function grantKey(provider: string) {
  const pool = platformKeysFor(provider)
  if (!pool.length) { toast(`no platform key for ${provider} — create one in platform keys first`); return }
  const fields: PromptField[] = []
  if (pool.length > 1) {
    fields.push({ key: 'key', label: 'platform key', type: 'select', required: true,
      options: pool.map((k) => ({ value: String(k.id), label: `${k.provider}/${k.label}` })) })
  }
  fields.push({ key: 'quota', label: 'daily quota', placeholder: 'blank = provider default', hint: 'max calls per day' })
  const r = await promptForm({
    title: `grant ${provider}`, description: `lend the shared ${provider} platform key to this user (quota-metered, key never revealed).`,
    fields, submitLabel: 'grant',
  })
  if (!r) return
  const keyId = pool.length > 1 ? Number(r.key) : pool[0]!.id
  const quota = r.quota ? Math.max(1, Number(r.quota)) : undefined
  try { await grantPlatformKey(sub.value, keyId, quota); toast(`${provider} granted`); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}
async function revokeKey(g: AdminGrant) {
  if (!await confirmAction({ title: 'revoke grant', danger: true, confirmLabel: 'revoke', message: `revoke ${g.provider}/${g.label}?` })) return
  try { await revokePlatformKey(sub.value, g.platform_key_id); toast('grant revoked'); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}
async function grantNs() {
  const r = await promptForm({
    title: 'grant a namespace', description: 'unlock a controlled (deny-by-default) namespace for this user.',
    fields: nsOptions.value.length
      ? [{ key: 'ns', label: 'namespace', type: 'select', required: true, placeholder: 'choose a namespace',
          options: nsOptions.value.map((n) => ({ value: n, label: n })) }]
      : [{ key: 'ns', label: 'namespace', required: true, hint: 'no controlled namespace in catalog — type one' }],
    submitLabel: 'grant',
  })
  if (!r) return
  try { await grantNamespace(sub.value, r.ns ?? ''); toast(`granted ${r.ns}`); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}
async function revokeNs(g: NamespaceGrant) {
  if (!await confirmAction({ title: 'revoke namespace grant', danger: true, confirmLabel: 'revoke', message: `revoke ${g.namespace}?` })) return
  try { await revokeNamespaceGrant(sub.value, g.namespace); toast('grant revoked'); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}

// Bascule le rôle d'org du user (member ↔ org_admin) depuis la fiche admin.
async function toggleOrgRole(o: AdminUserOrg) {
  const next = o.org_role === 'org_admin' ? 'org_member' : 'org_admin'
  const label = next === 'org_admin' ? 'make org admin' : 'remove org admin'
  if (!await confirmAction({ title: 'org role', confirmLabel: label, message: `${label} of "${o.name}"?` })) return
  try { await setAdminOrgMemberRole(o.org_id, sub.value, next); toast(`${o.name} → ${next === 'org_admin' ? 'org admin' : 'member'}`); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <RouterLink class="linklike" to="/console/adminusers">← users</RouterLink>
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <template v-if="detail">
      <!-- identité + rôle -->
      <ConsoleCard :title="detail.name || detail.email || detail.sub" sub="platform-admin user fiche.">
        <template #actions>
          <Tag v-if="accessStatus === 'active'" tone="olive">active</Tag>
          <Tag v-else-if="accessStatus === 'blocked'" tone="terra">blocked</Tag>
          <Tag v-else-if="accessStatus" tone="saffron">{{ accessStatus }}</Tag>
          <Tag v-if="isAdmin" tone="ink">platform admin</Tag>
          <Tag v-else tone="olive">user</Tag>
          <Btn v-if="canResend" kind="mini" :disabled="resending" @click="resendInvite">
            {{ resending ? 'sending…' : 'resend invite' }}
          </Btn>
          <Btn kind="mini" @click="toggleAdmin">{{ isAdmin ? 'remove admin' : 'make admin' }}</Btn>
        </template>
        <div class="helptext">
          {{ detail.email }} · <code class="mono">{{ detail.sub }}</code>
        </div>
        <div v-if="detail.pending_invite" class="helptext" style="margin-top: 6px">
          pending alpha invitation · expires {{ fmtDate(detail.pending_invite.expires_at) }} — resend issues a fresh link.
        </div>
        <div class="helptext" style="margin-top: 6px">
          platform role gates only the admin section — tool access comes from keys, grants and org membership below.
        </div>
      </ConsoleCard>

      <!-- organisations dont il est membre -->
      <ConsoleCard title="organizations" sub="orgs this user belongs to, with their role. shared keys & doctrine come from the active org.">
        <div v-if="detail.orgs.length" class="rowlist">
          <div v-for="o in detail.orgs" :key="o.org_id" class="rowitem" style="gap: 10px">
            <Dot :tone="o.is_active ? 'saffron' : 'faint'" :size="8" />
            <div style="flex: 1; min-width: 0">
              <span style="font-weight: 600; font-size: 13px">{{ o.name }}</span>
              <Tag :tone="o.org_role === 'org_admin' ? 'ink' : undefined" style="margin-left: 8px">{{ o.org_role === 'org_admin' ? 'org admin' : 'member' }}</Tag>
            </div>
            <Tag v-if="o.is_active" tone="saffron">active</Tag>
            <Btn kind="mini" @click="toggleOrgRole(o)">
              {{ o.org_role === 'org_admin' ? 'make member' : 'make admin' }}
            </Btn>
          </div>
        </div>
        <div v-else class="helptext">not a member of any organization.</div>
      </ConsoleCard>

      <!-- accès effectif par provider + grant/revoke inline de la clé plateforme -->
      <ConsoleCard flush title="connector access"
        sub="effective access per keyed provider — grant or revoke the shared platform key inline. own key wins over org, org over platform.">
        <table class="tbl">
          <thead><tr><th style="width: 18px"></th><th>provider</th><th>access</th><th style="width: 90px"></th></tr></thead>
          <tbody>
            <tr v-for="[name, p] in providerRows" :key="name">
              <td><Dot :tone="p.mode === 'forbidden' ? 'faint' : p.mode === 'over_quota' ? 'terra' : p.mode === 'platform' ? 'saffron' : 'olive'" :size="7" /></td>
              <td style="font-weight: 600; color: var(--color-ink)">{{ name }}</td>
              <td><Tag :tone="access(p).tone">{{ access(p).text }}</Tag></td>
              <td style="text-align: right">
                <Btn v-if="grantFor(name)" kind="danger" @click="revokeKey(grantFor(name)!)">revoke</Btn>
                <Btn v-else-if="platformKeysFor(name).length" kind="mini" @click="grantKey(name)">grant key</Btn>
                <span v-else class="dim" style="font-size: 11px">no platform key</span>
              </td>
            </tr>
            <tr v-if="!providerRows.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no keyed providers</td></tr>
          </tbody>
        </table>
      </ConsoleCard>

      <!-- namespaces débloqués -->
      <ConsoleCard title="namespace grants" sub="controlled (deny-by-default) namespaces this user can see & call.">
        <template #actions><Btn kind="mini" @click="grantNs">grant a namespace</Btn></template>
        <div v-if="detail.namespace_grants.length" class="rowlist">
          <div v-for="g in detail.namespace_grants" :key="g.namespace" class="rowitem" style="gap: 10px">
            <Tag tone="cobalt">{{ g.namespace }}</Tag>
            <span class="dim" style="flex: 1; font-size: 11.5px">granted {{ fmtDate(g.granted_at) }}</span>
            <Btn kind="danger" @click="revokeNs(g)">revoke</Btn>
          </div>
        </div>
        <div v-else class="helptext">no namespace grants — sensitive connectors stay hidden for this user.</div>
      </ConsoleCard>

      <!-- activité -->
      <ConsoleCard flush title="activity" sub="recent tool calls (last 30 days, up to 100).">
        <template #actions>
          <span class="dim" style="font-size: 11.5px">{{ calls.length }} calls · <ErrLabel v-if="callsErrCount">{{ callsErrCount }} err</ErrLabel><span v-else class="dim">0 err</span></span>
        </template>
        <table class="tbl">
          <thead><tr><th style="width: 18px"></th><th>tool</th><th>when</th><th class="num">duration</th><th>status</th></tr></thead>
          <tbody>
            <tr v-for="c in calls" :key="c.id">
              <td><Dot :tone="c.ok ? 'olive' : 'terra'" :size="7" /></td>
              <td><code class="mono">{{ c.tool_name }}</code></td>
              <td class="dim">{{ fmtDate(c.called_at) }}</td>
              <td class="num dim">{{ c.duration_ms != null ? c.duration_ms + ' ms' : '—' }}</td>
              <td><ErrLabel v-if="!c.ok">{{ c.error || 'error' }}</ErrLabel><span v-else class="dim">ok</span></td>
            </tr>
            <tr v-if="callsBusy"><td colspan="5" class="dim" style="text-align: center; padding: 16px">loading…</td></tr>
            <tr v-else-if="!calls.length"><td colspan="5" class="dim" style="text-align: center; padding: 16px">no calls in the window</td></tr>
          </tbody>
        </table>
      </ConsoleCard>
    </template>
  </div>
</template>
