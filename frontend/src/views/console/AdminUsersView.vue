<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import {
  getAdminUsers, setUserRole, getNamespaceGrants, revokeNamespaceGrant,
  getPlatformKeys, grantPlatformKey, revokePlatformKey, grantNamespace, getConnectors,
} from '@/api/console'
import type { AdminGrant, AdminUser, ConnectorMeta, NamespaceGrant, PlatformKey } from '@/types/api'
import { fmtDate } from '@/types/api'

const { toast } = useToast()
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
// Namespaces grant-only (sensibles) = connecteurs platform_granted du registre.
const nsOptions = computed(() =>
  [...new Set(catalog.value.filter((c) => c.availability === 'platform_granted').flatMap((c) => c.namespaces))],
)

const ROLES = ['guest', 'member', 'admin']

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
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
onMounted(load)
const reloadUsers = async () => { users.value = (await getAdminUsers()).users }

async function setRole(u: AdminUser) {
  const role = window.prompt(`role for ${u.email} (${ROLES.join(' / ')})`, u.effective_role)?.trim()
  if (!role || role === u.effective_role) return
  if (!ROLES.includes(role)) { toast(`invalid role: ${role}`); return }
  try { await setUserRole(u.sub, role); toast(`${u.email} → ${role}`); await reloadUsers() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}

async function grantKey(u: AdminUser) {
  if (!keys.value.length) { toast('no platform keys — create one first'); return }
  const menu = keys.value.map((k, i) => `${i + 1}. ${k.provider}/${k.label}`).join('\n')
  const pick = window.prompt(`grant a platform key to ${u.email}:\n${menu}\n\nnumber:`)?.trim()
  if (!pick) return
  const k = keys.value[Number(pick) - 1]
  if (!k) { toast('invalid choice'); return }
  const raw = window.prompt(`daily quota for ${k.provider}/${k.label} (blank = provider default)`)?.trim()
  const quota = raw ? Math.max(1, Number(raw)) : undefined
  try { await grantPlatformKey(u.sub, k.id, quota); toast(`granted ${k.provider}/${k.label}`); await reloadUsers() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function revokeKey(u: AdminUser, g: AdminGrant) {
  if (!window.confirm(`revoke ${g.provider}/${g.label} from ${u.email}?`)) return
  try { await revokePlatformKey(u.sub, g.platform_key_id); toast('grant revoked'); await reloadUsers() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function grantNs(u: AdminUser) {
  const hint = nsOptions.value.join(', ') || 'no controlled namespaces in catalog'
  const ns = window.prompt(`grant a namespace to ${u.email} (${hint})`)?.trim()
  if (!ns) return
  try { await grantNamespace(u.sub, ns); toast(`granted ${ns}`); grants.value = (await getNamespaceGrants()).grants }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function revoke(g: NamespaceGrant) {
  if (!window.confirm(`revoke ${g.namespace} for ${g.email}?`)) return
  try { await revokeNamespaceGrant(g.sub, g.namespace); toast('grant revoked'); grants.value = (await getNamespaceGrants()).grants }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="grid3">
      <Stat label="users" :value="users.length" sub="platform-wide" />
      <Stat label="grants live" :value="grantsTotal" sub="platform key grants" />
      <Stat label="namespace grants" :value="grants.length" sub="controlled namespaces" />
    </div>

    <ConsoleCard flush title="users"
      sub="platform roles: guest (no tools) → member → admin. grant platform keys (quota-metered) and controlled namespaces per user.">
      <template #actions>
        <input v-model="q" class="inp" placeholder="filter by name or email…" style="width: 220px" />
      </template>
      <table class="tbl">
        <thead><tr><th>user</th><th>role</th><th>platform key grants</th><th style="width: 210px; text-align: right"></th></tr></thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.sub">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ u.name || u.email }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">{{ u.email }}</div>
            </td>
            <td>
              <Tag v-if="u.effective_role === 'admin'" tone="ink">admin</Tag>
              <Tag v-else-if="u.effective_role === 'member'" tone="olive">member</Tag>
              <Tag v-else tone="saffron">guest</Tag>
            </td>
            <td>
              <div v-if="u.grants.length" style="display: flex; flex-wrap: wrap; gap: 4px">
                <button v-for="g in u.grants" :key="g.platform_key_id" class="grant-chip"
                  :title="`revoke ${g.provider}/${g.label}${g.daily_quota ? ' · ' + g.daily_quota + '/day' : ''}`"
                  @click="revokeKey(u, g)">{{ g.provider }}<span v-if="g.daily_quota" class="q">{{ g.daily_quota }}</span> ✕</button>
              </div>
              <span v-else class="dim">—</span>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <Btn kind="mini" @click="grantKey(u)">grant key</Btn>
              <Btn kind="mini" @click="grantNs(u)">grant ns</Btn>
              <Btn kind="mini" @click="setRole(u)">role</Btn>
            </td>
          </tr>
          <tr v-if="!filtered.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no users</td></tr>
        </tbody>
      </table>
    </ConsoleCard>

    <ConsoleCard flush title="namespace grants"
      sub="per-user unlocks for controlled namespaces — independent from org entitlements.">
      <table class="tbl">
        <thead><tr><th>user</th><th>namespace</th><th>granted</th><th style="width: 90px"></th></tr></thead>
        <tbody>
          <tr v-for="(g, i) in grants" :key="i">
            <td class="dim" style="color: var(--color-ink-soft)">{{ g.email || g.sub }}</td>
            <td><Tag tone="cobalt">{{ g.namespace }}</Tag></td>
            <td class="dim">{{ fmtDate(g.granted_at) }}</td>
            <td style="text-align: right"><Btn kind="danger" @click="revoke(g)">revoke</Btn></td>
          </tr>
          <tr v-if="!grants.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no namespace grants</td></tr>
        </tbody>
      </table>
    </ConsoleCard>
  </div>
</template>
