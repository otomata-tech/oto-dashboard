<script setup lang="ts">
// Procédures de l'équipe consultée (scope team, /team/procedures). Monte GroupDoctrineCard
// en mode `section="procedures"` : la liste des procédures d'équipe (chargées à la demande),
// SANS la ligne readme — le readme d'équipe s'édite seulement sur /team/context. Keyé par
// groupId. Autz portée backend ; `canManage` masque les contrôles.
import GroupDoctrineCard from '@/components/console/GroupDoctrineCard.vue'
import TeamScopeHeader from '@/components/console/TeamScopeHeader.vue'
import { useTeamScope } from '@/composables/useTeamScope'

const { groupId, detail, error, loaded, canManage } = useTeamScope()
</script>

<template>
  <TeamScopeHeader :detail="detail" :loaded="loaded" :error="error" :group-id="groupId" v-slot="{ detail: d }">
    <GroupDoctrineCard :key="d.group.id" :group-id="d.group.id" :can-edit="canManage" section="procedures" />
  </TeamScopeHeader>
</template>
