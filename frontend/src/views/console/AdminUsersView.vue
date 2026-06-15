<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import {
  getAdminUsers, setUserRole, getNamespaceGrants, revokeNamespaceGrant,
  getPlatformKeys, grantPlatformKey, revokePlatformKey, grantNamespace, getConnectors,
  getMonitoringCalls,
} from '@/api/console'
import type { AdminGrant, AdminUser, ConnectorMeta, NamespaceGrant, PlatformKey, ToolCall } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()
const users = ref<AdminUser[]>([])
const grants = ref<NamespaceGrant[]>([])
const keys = ref<PlatformKey[]>([])
const catalog = ref<ConnectorMeta[]>([])
const error = ref<string | null>(null)
const q = ref('')

const filtered = computed(() =>
  users.value.filter((u) => !q.value || ((u.email ?? '') + (u.name ?? '')).toLowerCase().includes(q.value.toLowerCase())),
)
const grantsTotal = computed(() => users.value.reduce((a, u) => a + u.grants.length, 0))
const nsCountFor = (sub: string) => grants.value.filter((g) => g.sub === sub).length
// Namespaces grant-only (sensibles) = connecteurs platform_granted du registre.
const nsOptions = computed(() =>
  [...new Set(catalog.value.filter((c) => c.availability === 'platform_granted').flatMap((c) => c.namespaces))],
)

const ROLES = ['guest', 'member', 'admin']

// ── fiche user (détail : rôle, clés, namespaces, activité) ──
// On retient le sub (pas l'objet) → la fiche reste à jour après reloadUsers().
const selectedSub = ref<string | null>(null)
const selected = computed(() => users.value.find((u) => u.sub === selectedSub.value) ?? null)
const selectedNs = computed(() => grants.value.filter((g) => g.sub === selectedSub.value))
const calls = ref<ToolCall[]>([])
const callsBusy = ref(false)
const callsErr = ref<string | null>(null)
const callsErrCount = computed(() => calls.value.filter((c) => !c.ok).length)

async function load() {
  try {
    const [u, g, k, cat] = await Promise.all([
      getAdminUsers(),
      getNamespaceGrants().catch(() => ({ grants: [] })),
      getPlatformKeys().catch(() => ({ platform_keys: [] })),
      getConnectors().catch(() => ({ connectors: [] })),
    ])
    users.value = u.users
    grants.value = g.grants
    keys.value = k.platform_keys
    catalog.value = cat.connectors
  } catch (e) { error.value = humanize(e) }
}
onMounted(load)
const reloadUsers = async () => { users.value = (await getAdminUsers()).users }
const reloadNs = async () => { grants.value = (await getNamespaceGrants()).grants }

async function openUser(u: AdminUser) {
  selectedSub.value = u.sub
  calls.value = []; callsErr.value = null; callsBusy.value = true
  try { calls.value = (await getMonitoringCalls({ sub: u.sub, limit: 100, days: 30 })).calls }
  catch (e) { callsErr.value = humanize(e) }
  finally { callsBusy.value = false }
}
function closeUser() { selectedSub.value = null; calls.value = [] }

async function setRole(u: AdminUser) {
  const r = await promptForm({
    title: 'platform role', description: u.email ?? u.sub,
    fields: [{ key: 'role', label: 'role', type: 'select', required: true, value: u.effective_role,
      options: ROLES.map((x) => ({ value: x, label: x })) }],
    submitLabel: 'update',
  })
  if (!r || r.role === u.effective_role) return
  try { await setUserRole(u.sub, r.role ?? ''); toast(`${u.email} → ${r.role}`); await reloadUsers() }
  catch (e) { toast(humanize(e)) }
}

async function grantKey(u: AdminUser) {
  if (!keys.value.length) { toast('no platform keys — create one first'); return }
  const r = await promptForm({
    title: 'grant a platform key', description: `lent to ${u.email}, metered by a daily quota.`,
    fields: [
      { key: 'key', label: 'platform key', type: 'select', required: true, placeholder: 'choose a key',
        options: keys.value.map((k) => ({ value: String(k.id), label: `${k.provider}/${k.label}` })) },
      { key: 'quota', label: 'daily quota', placeholder: 'blank = provider default', hint: 'max calls per day' },
    ],
    submitLabel: 'grant',
  })
  if (!r) return
  const quota = r.quota ? Math.max(1, Number(r.quota)) : undefined
  try { await grantPlatformKey(u.sub, Number(r.key), quota); toast('grant added'); await reloadUsers() }
  catch (e) { toast(humanize(e)) }
}
async function revokeKey(u: AdminUser, g: AdminGrant) {
  if (!await confirmAction({ title: 'revoke grant', danger: true, confirmLabel: 'revoke',
    message: `revoke ${g.provider}/${g.label} from ${u.email}?` })) return
  try { await revokePlatformKey(u.sub, g.platform_key_id); toast('grant revoked'); await reloadUsers() }
  catch (e) { toast(humanize(e)) }
}
async function grantNs(u: AdminUser) {
  const r = await promptForm({
    title: 'grant a namespace', description: `controlled namespace unlocked for ${u.email}.`,
    fields: nsOptions.value.length
      ? [{ key: 'ns', label: 'namespace', type: 'select', required: true, placeholder: 'choose a namespace',
          options: nsOptions.value.map((n) => ({ value: n, label: n })) }]
      : [{ key: 'ns', label: 'namespace', required: true, hint: 'no controlled namespace in catalog — type one' }],
    submitLabel: 'grant',
  })
  if (!r) return
  try { await grantNamespace(u.sub, r.ns ?? ''); toast(`granted ${r.ns}`); await reloadNs() }
  catch (e) { toast(humanize(e)) }
}
async function revoke(g: NamespaceGrant) {
  if (!await confirmAction({ title: 'revoke namespace grant', danger: true, confirmLabel: 'revoke',
    message: `revoke ${g.namespace} for ${g.email}?` })) return
  try { await revokeNamespaceGrant(g.sub, g.namespace); toast('grant revoked'); await reloadNs() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="grid3">
      <Stat label="users" :value="users.length" sub="platform-wide" />
      <Stat label="key grants" :value="grantsTotal" sub="platform keys lent" />
      <Stat label="namespace grants" :value="grants.length" sub="controlled namespaces" />
    </div>

    <ConsoleCard flush title="users"
      sub="click a user to open their fiche — role, platform-key grants, namespaces and activity.">
      <template #actions>
        <input v-model="q" class="inp" placeholder="filter by name or email…" style="width: 220px" />
      </template>
      <table class="tbl">
        <thead><tr><th>user</th><th>role</th><th>access</th><th style="width: 90px"></th></tr></thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.sub" style="cursor: pointer"
            :style="u.sub === selectedSub ? 'background: var(--color-paper-2)' : ''" @click="openUser(u)">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ u.name || u.email }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">{{ u.email }}</div>
            </td>
            <td>
              <Tag v-if="u.effective_role === 'admin'" tone="ink">admin</Tag>
              <Tag v-else-if="u.effective_role === 'member'" tone="olive">member</Tag>
              <Tag v-else tone="saffron">guest</Tag>
            </td>
            <td class="dim">{{ u.grants.length }} key{{ u.grants.length === 1 ? '' : 's' }} · {{ nsCountFor(u.sub) }} ns</td>
            <td style="text-align: right"><span class="linklike">manage →</span></td>
          </tr>
          <tr v-if="!filtered.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no users</td></tr>
        </tbody>
      </table>
    </ConsoleCard>

    <!-- fiche du user sélectionné -->
    <ConsoleCard v-if="selected" :title="selected.name || selected.email || selected.sub"
      sub="role, access and recent activity for this user.">
      <template #actions>
        <Btn kind="mini" @click="closeUser">close</Btn>
      </template>

      <!-- identité + rôle -->
      <div class="rowitem" style="gap: 10px; border-bottom: 1px solid var(--color-hair-soft)">
        <div style="flex: 1; min-width: 0">
          <div style="font-size: 11.5px; color: var(--color-mute)">{{ selected.email }} · <code class="mono">{{ selected.sub }}</code></div>
        </div>
        <Tag v-if="selected.effective_role === 'admin'" tone="ink">admin</Tag>
        <Tag v-else-if="selected.effective_role === 'member'" tone="olive">member</Tag>
        <Tag v-else tone="saffron">guest</Tag>
        <Btn kind="mini" @click="setRole(selected)">change role</Btn>
      </div>

      <!-- clés plateforme prêtées -->
      <div style="padding: 14px 0; border-bottom: 1px solid var(--color-hair-soft)">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px">
          <div style="font-weight: 600; font-size: 13px">platform key grants</div>
          <div class="helptext" style="flex: 1">shared platform keys lent to this user (quota-metered). their own keys always win.</div>
          <Btn kind="mini" @click="grantKey(selected)">grant a key</Btn>
        </div>
        <div v-if="selected.grants.length" class="rowlist">
          <div v-for="g in selected.grants" :key="g.platform_key_id" class="rowitem" style="gap: 10px">
            <Dot tone="olive" :size="7" />
            <div style="flex: 1; min-width: 0">
              <span style="font-weight: 600; font-size: 13px">{{ g.provider }}/{{ g.label }}</span>
              <span v-if="g.daily_quota" class="dim" style="font-size: 11.5px"> · {{ g.daily_quota }}/day</span>
            </div>
            <Btn kind="danger" @click="revokeKey(selected, g)">revoke</Btn>
          </div>
        </div>
        <div v-else class="helptext">no platform key grants — this user relies only on their own keys.</div>
      </div>

      <!-- namespaces débloqués -->
      <div style="padding: 14px 0; border-bottom: 1px solid var(--color-hair-soft)">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px">
          <div style="font-weight: 600; font-size: 13px">namespace grants</div>
          <div class="helptext" style="flex: 1">controlled (deny-by-default) namespaces this user can see &amp; call.</div>
          <Btn kind="mini" @click="grantNs(selected)">grant a namespace</Btn>
        </div>
        <div v-if="selectedNs.length" class="rowlist">
          <div v-for="g in selectedNs" :key="g.namespace" class="rowitem" style="gap: 10px">
            <Tag tone="cobalt">{{ g.namespace }}</Tag>
            <span class="dim" style="flex: 1; font-size: 11.5px">granted {{ fmtDate(g.granted_at) }}</span>
            <Btn kind="danger" @click="revoke(g)">revoke</Btn>
          </div>
        </div>
        <div v-else class="helptext">no namespace grants — sensitive connectors stay hidden for this user.</div>
      </div>

      <!-- activité -->
      <div style="padding-top: 14px">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px">
          <div style="font-weight: 600; font-size: 13px">activity</div>
          <div class="helptext" style="flex: 1">recent tool calls (last 30 days, up to 100).</div>
          <span class="dim" style="font-size: 11.5px">{{ calls.length }} calls · <ErrLabel v-if="callsErrCount">{{ callsErrCount }} err</ErrLabel><span v-else class="dim">0 err</span></span>
        </div>
        <p v-if="callsErr" class="helptext" style="color: var(--color-terra-ink)">{{ callsErr }}</p>
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
      </div>
    </ConsoleCard>
  </div>
</template>
