<script setup lang="ts">
// Détail d'UNE équipe (org_admin sur /org/teams/:teamId) — réintroduit après oto#192,
// périmètre resserré aux membres seuls (cf. TeamMembersCard). `canManage` = org_admin
// (canAdministerOrg) OU chef explicite de CETTE équipe (`group.my_role`) : un org_admin
// administre toute équipe de son org même sans rôle explicite dessus (anti-lockout,
// backend #280) — `my_role` seul sous-compterait ce cas.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import TeamMembersCard from '@/components/console/TeamMembersCard.vue'
import InvitationsCard from '@/components/console/InvitationsCard.vue'
import { useMe, canAdministerOrg } from '@/composables/useMe'
import { getGroup } from '@/api/console'
import type { GroupDetail } from '@/types/api'
import { humanize } from '@/lib/errors'

const route = useRoute()
const { me } = useMe()

const teamId = computed(() => Number(route.params.teamId))
const detail = ref<GroupDetail | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)

const orgAdmin = computed(() => canAdministerOrg(me.value))
const canManage = computed(() => orgAdmin.value || detail.value?.group.my_role === 'group_admin')
const meSub = computed(() => me.value?.sub ?? null)

async function load() {
  loaded.value = false
  error.value = null
  try { detail.value = await getGroup(teamId.value) }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)
watch(teamId, load)
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <template v-if="loaded && detail">
      <ConsoleCard :title="detail.group.name" :sub="detail.group.description || 'team detail.'" />
      <TeamMembersCard :key="detail.group.id" :group-id="detail.group.id" :org-id="detail.group.org_id"
        :members="detail.members" :can-manage="canManage" :me-sub="meSub" @changed="load" />
      <!-- Inviter une personne NOUVELLE (pas encore dans l'org) : elle rejoint l'org et
           l'équipe au clic. Lister exige le même droit qu'inviter (`GROUP_ADMIN_OF`). -->
      <InvitationsCard v-if="canManage" :scope="{ level: 'team', id: detail.group.id }"
        :can-read="canManage" :can-manage="canManage" />
    </template>
  </div>
</template>
