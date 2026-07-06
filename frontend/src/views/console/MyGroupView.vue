<script setup lang="ts">
// « Gérer mon groupe » (niveau nav `group`, ADR 0012) — la surface du CHEF : gérer
// LE groupe actif (membres, clés partagées, agent readme) sans passer par l'écran
// org des départements (réservé org_admin). Centré sur `me.active_group` ; réutilise
// GroupDetailCards + GroupDoctrineCard (mêmes cartes que la vue org, « derive don't
// duplicate »). Le backend porte l'autz ; l'UI masque juste les contrôles.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import GroupDetailCards from '@/components/console/GroupDetailCards.vue'
import GroupDoctrineCard from '@/components/console/GroupDoctrineCard.vue'
import { useToast } from '@/composables/useToast'
import { useMe } from '@/composables/useMe'
import { getGroup, clearActiveGroup } from '@/api/console'
import type { GroupDetail } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { me, reload } = useMe()

const detail = ref<GroupDetail | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)

const activeGroupId = computed(() => me.value?.active_group ?? null)
const meSub = computed(() => me.value?.sub ?? null)
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin' || me.value?.role === 'admin')
// Chef du groupe actif (escalade org_admin/platform incluse côté UI).
const canManage = computed(() =>
  !!detail.value && (detail.value.group.my_role === 'group_admin' || isOrgAdmin.value))

async function load() {
  const id = activeGroupId.value
  if (id == null) { detail.value = null; loaded.value = true; return }
  try { detail.value = await getGroup(id) }
  catch (e) { error.value = humanize(e); detail.value = null }
  finally { loaded.value = true }
}
onMounted(load)

async function leaveActive() {
  try { await clearActiveGroup(); await reload(); toast('back to org level'); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeGroupId == null" title="no active group">
      <div class="helptext">
        you have no active group. pick a team in the org switcher (top of the sidebar) to
        work at group level — or ask an org admin to add you to a group.
      </div>
    </ConsoleCard>

    <template v-else-if="detail">
      <ConsoleCard :title="detail.group.name" :sub="detail.group.description || 'your active group'">
        <template #actions>
          <Btn kind="mini" @click="leaveActive">Leave group (operate at org level)</Btn>
        </template>
        <div class="helptext">
          {{ canManage ? 'you lead this group — manage its members, shared keys and agent readme below.'
                        : 'you are a member of this group. management is reserved to the team lead.' }}
        </div>
      </ConsoleCard>

      <div class="grid23">
        <GroupDetailCards :group-id="detail.group.id" :members="detail.members" :secrets="detail.secrets"
          :can-manage="canManage" :me-sub="meSub" @changed="load" />
      </div>

      <GroupDoctrineCard :group-id="detail.group.id" :can-edit="canManage" />
    </template>
  </div>
</template>
