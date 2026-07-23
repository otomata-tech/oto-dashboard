<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import InvitationsCard from '@/components/console/InvitationsCard.vue'
import { getAdminUsers } from '@/api/console'
import { useMe } from '@/composables/useMe'
import type { AdminUser } from '@/types/api'
import { humanize } from '@/lib/errors'

const router = useRouter()
const { me } = useMe()
const users = ref<AdminUser[]>([])
const error = ref<string | null>(null)
const q = ref('')

// Inviter un user sur la plateforme = sommet de la feature cascade (admin plateforme).
const canInvite = computed(() => me.value?.role === 'admin' || me.value?.role === 'super_admin')

const filtered = computed(() =>
  users.value.filter((u) => !q.value || ((u.email ?? '') + (u.name ?? '')).toLowerCase().includes(q.value.toLowerCase())),
)
const grantsTotal = computed(() => users.value.reduce((a, u) => a + u.grants.length, 0))

function openUser(u: AdminUser) {
  router.push(`/platform/users/${encodeURIComponent(u.sub)}`)
}

onMounted(async () => {
  try {
    users.value = (await getAdminUsers()).users
  } catch (e) { error.value = humanize(e) }
})
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="grid3">
      <Stat label="utilisateurs" :value="users.length" sub="toute la plateforme" />
      <Stat label="prêts de clé" :value="grantsTotal" sub="clés plateforme prêtées" />
    </div>

    <ConsoleCard flush title="utilisateurs"
      sub="clique un utilisateur pour ouvrir sa fiche — rôle, accès connecteurs, prêts de clé et activité.">
      <template #actions>
        <input v-model="q" class="inp" placeholder="filtrer par nom ou email…" style="width: 220px" />
      </template>
      <ConsoleTable :rows="filtered" empty="aucun utilisateur">
        <template #head>
          <th>utilisateur</th><th>rôle</th><th>accès</th><th style="width: 90px"></th>
        </template>
        <template #row="{ row: u }">
          <tr style="cursor: pointer" @click="openUser(u)">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ u.name || u.email }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">{{ u.email }}</div>
            </td>
            <td>
              <Tag v-if="u.effective_role === 'super_admin'" tone="terra">super admin</Tag>
              <Tag v-else-if="u.effective_role === 'admin'" tone="ink">admin</Tag>
              <Tag v-else tone="olive">user</Tag>
            </td>
            <td class="dim">{{ u.grants.length }} clé{{ u.grants.length === 1 ? '' : 's' }}</td>
            <td style="text-align: right"><span class="linklike">gérer →</span></td>
          </tr>
        </template>
      </ConsoleTable>
    </ConsoleCard>

    <InvitationsCard v-if="canInvite" :scope="{ level: 'platform' }" :can-manage="canInvite" />
  </div>
</template>
