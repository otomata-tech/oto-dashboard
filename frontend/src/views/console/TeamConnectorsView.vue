<script setup lang="ts">
// Connecteurs de l'équipe consultée (scope team, /team/connectors). Monte le cockpit
// GroupConnectorsCard (clé partagée d'équipe, même dialecte que /org/connectors), keyé
// par groupId. Le SEUL levier au grain équipe est la clé partagée (cascade perso › équipe
// › org › plateforme) ; disponibilité/ACL restent des concepts d'org.
import GroupConnectorsCard from '@/components/console/GroupConnectorsCard.vue'
import TeamScopeHeader from '@/components/console/TeamScopeHeader.vue'
import { useTeamScope } from '@/composables/useTeamScope'

const { groupId, detail, error, loaded, canManage, reload } = useTeamScope()
</script>

<template>
  <TeamScopeHeader :detail="detail" :loaded="loaded" :error="error" :group-id="groupId" v-slot="{ detail: d }">
    <GroupConnectorsCard :key="d.group.id" :group-id="d.group.id" :secrets="d.secrets"
      :can-manage="canManage" @changed="reload" />
  </TeamScopeHeader>
</template>
