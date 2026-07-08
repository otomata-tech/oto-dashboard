<script setup lang="ts">
// Membres de l'équipe consultée (scope team, /team = racine). Monte GroupDetailCards
// (implémentation unique des gestes membre, keyée par groupId). Le backend porte l'autz ;
// `canManage` masque seulement les contrôles (chef d'équipe OU admin d'org/plateforme).
import GroupDetailCards from '@/components/console/GroupDetailCards.vue'
import TeamScopeHeader from '@/components/console/TeamScopeHeader.vue'
import { useTeamScope } from '@/composables/useTeamScope'

const { groupId, detail, error, loaded, canManage, meSub, reload } = useTeamScope()
</script>

<template>
  <TeamScopeHeader :detail="detail" :loaded="loaded" :error="error" :group-id="groupId" v-slot="{ detail: d }">
    <GroupDetailCards :key="d.group.id" :group-id="d.group.id" :org-id="d.group.org_id"
      :members="d.members" :can-manage="canManage" :me-sub="meSub" @changed="reload" />
  </TeamScopeHeader>
</template>
