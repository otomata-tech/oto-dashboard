<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import { getAdminUsers, getNamespaceGrants } from '@/api/console'
import type { AdminUser, NamespaceGrant } from '@/types/api'
import { humanize } from '@/lib/errors'

const router = useRouter()
const users = ref<AdminUser[]>([])
const grants = ref<NamespaceGrant[]>([])
const error = ref<string | null>(null)
const q = ref('')

const filtered = computed(() =>
  users.value.filter((u) => !q.value || ((u.email ?? '') + (u.name ?? '')).toLowerCase().includes(q.value.toLowerCase())),
)
const grantsTotal = computed(() => users.value.reduce((a, u) => a + u.grants.length, 0))
const nsCountFor = (sub: string) => grants.value.filter((g) => g.sub === sub).length

function openUser(u: AdminUser) {
  router.push(`/console/adminusers/user/${encodeURIComponent(u.sub)}`)
}

onMounted(async () => {
  try {
    const [u, g] = await Promise.all([getAdminUsers(), getNamespaceGrants().catch(() => ({ grants: [] }))])
    users.value = u.users
    grants.value = g.grants
  } catch (e) { error.value = humanize(e) }
})
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
      sub="click a user to open their fiche — role, connector access, grants, namespaces and activity.">
      <template #actions>
        <input v-model="q" class="inp" placeholder="filter by name or email…" style="width: 220px" />
      </template>
      <table class="tbl">
        <thead><tr><th>user</th><th>role</th><th>access</th><th style="width: 90px"></th></tr></thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.sub" style="cursor: pointer" @click="openUser(u)">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ u.name || u.email }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">{{ u.email }}</div>
            </td>
            <td>
              <Tag v-if="u.effective_role === 'super_admin'" tone="terra">super admin</Tag>
              <Tag v-else-if="u.effective_role === 'admin'" tone="ink">admin</Tag>
              <Tag v-else tone="olive">user</Tag>
            </td>
            <td class="dim">{{ u.grants.length }} key{{ u.grants.length === 1 ? '' : 's' }} · {{ nsCountFor(u.sub) }} ns</td>
            <td style="text-align: right"><span class="linklike">manage →</span></td>
          </tr>
          <tr v-if="!filtered.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no users</td></tr>
        </tbody>
      </table>
    </ConsoleCard>
  </div>
</template>
