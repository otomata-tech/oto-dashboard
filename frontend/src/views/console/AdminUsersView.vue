<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { getAdminUsers, setUserRole, getNamespaceGrants, revokeNamespaceGrant } from '@/api/console'
import type { AdminUser, NamespaceGrant } from '@/types/api'
import { fmtDate } from '@/types/api'

const { toast } = useToast()
const users = ref<AdminUser[]>([])
const grants = ref<NamespaceGrant[]>([])
const error = ref<string | null>(null)
const q = ref('')

const filtered = computed(() =>
  users.value.filter((u) => !q.value || ((u.email ?? '') + (u.name ?? '')).toLowerCase().includes(q.value.toLowerCase())),
)
const grantsTotal = computed(() => users.value.reduce((a, u) => a + u.grants.length, 0))

const ROLES = ['guest', 'member', 'admin']
function nextRole(r: string) { return ROLES[(ROLES.indexOf(r) + 1) % ROLES.length]! }

async function load() {
  try {
    const [u, g] = await Promise.all([getAdminUsers(), getNamespaceGrants().catch(() => ({ grants: [] }))])
    users.value = u.users
    grants.value = g.grants
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
onMounted(load)

async function cycleRole(u: AdminUser) {
  const role = nextRole(u.effective_role)
  try { await setUserRole(u.sub, role); toast(`${u.email} → ${role}`); users.value = (await getAdminUsers()).users }
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
      sub="platform roles: guest (no tools) → member → admin. click a role to cycle it.">
      <template #actions>
        <input v-model="q" class="inp" placeholder="filter by name or email…" style="width: 220px" />
      </template>
      <table class="tbl">
        <thead><tr><th>user</th><th>role</th><th class="num">grants</th><th>since</th><th style="width: 90px"></th></tr></thead>
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
            <td class="num"><template v-if="u.grants.length">{{ u.grants.length }}</template><span v-else class="dim">0</span></td>
            <td class="dim">{{ fmtDate(u.created_at) }}</td>
            <td style="text-align: right">
              <Btn kind="mini" @click="cycleRole(u)">change role</Btn>
            </td>
          </tr>
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
