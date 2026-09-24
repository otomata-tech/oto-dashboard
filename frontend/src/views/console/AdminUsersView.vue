<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import SortTh from '@/components/console/SortTh.vue'
import InvitationsCard from '@/components/console/InvitationsCard.vue'
import { getAdminUsers } from '@/api/console'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import type { AdminUser } from '@/types/api'
import { fmtDay } from '@/types/api'
import { humanize } from '@/lib/errors'

const router = useRouter()
const { me } = useMe()
const users = ref<AdminUser[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

// Inviter un user sur la plateforme = sommet de la feature cascade (admin plateforme).
const canInvite = computed(() => isPlatformOperator(me.value))

// Recherche et tri : portés par ConsoleTable. Par défaut, les derniers inscrits en tête
// (l'opérateur cherche d'abord qui vient d'arriver).
const ROLE_RANK: Record<string, number> = { super_admin: 0, admin: 1 }
const searchOf = (u: AdminUser) => `${u.name ?? ''} ${u.email ?? ''}`
const sorts = {
  nom: (u: AdminUser) => u.name || u.email,
  role: (u: AdminUser) => ROLE_RANK[u.effective_role] ?? 2,
  inscrit: (u: AdminUser) => u.created_at,
  acces: (u: AdminUser) => u.grants.length,
}
const grantsTotal = computed(() => users.value.reduce((a, u) => a + u.grants.length, 0))

function openUser(u: AdminUser) {
  router.push(`/platform/users/${encodeURIComponent(u.sub)}`)
}

onMounted(async () => {
  try {
    users.value = (await getAdminUsers()).users
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
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
      <ConsoleTable :rows="users" :busy="!loaded" :loaded="loaded" empty="aucun utilisateur"
        :search="searchOf" search-placeholder="nom ou email…"
        :sorts="sorts" :default-sort="{ key: 'inscrit', dir: 'desc' }">
        <template #head="{ sort }">
          <SortTh k="nom" :sort="sort">utilisateur</SortTh><SortTh k="role" :sort="sort">rôle</SortTh>
          <SortTh k="inscrit" :sort="sort">inscrit le</SortTh><SortTh k="acces" :sort="sort">accès</SortTh>
          <th style="width: 90px"></th>
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
            <td class="dim">{{ fmtDay(u.created_at) }}</td>
            <td class="dim">{{ u.grants.length }} clé{{ u.grants.length === 1 ? '' : 's' }}</td>
            <td style="text-align: right"><span class="linklike">gérer →</span></td>
          </tr>
        </template>
      </ConsoleTable>
    </ConsoleCard>

    <InvitationsCard v-if="canInvite" :scope="{ level: 'platform' }" :can-read="canInvite" :can-manage="canInvite" />
  </div>
</template>
