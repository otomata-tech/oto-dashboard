<script setup lang="ts">
// Connecteurs de l'équipe consultée (/team/connectors). Wrapper mince : garde
// « aucune équipe » (TeamScopeHeader) + la coquille unifiée `ConnectorScopeView`
// (scope=team dérivé de la route). L'adaptateur team porte la clé partagée d'équipe
// (et, à venir, disponibilité/accès d'équipe — backend B1/B2).
import TeamScopeHeader from '@/components/console/TeamScopeHeader.vue'
import ConnectorScopeView from '@/components/console/connector-scope/ConnectorScopeView.vue'
import { useTeamScope } from '@/composables/useTeamScope'

const { groupId, detail, error, loaded } = useTeamScope()
</script>

<template>
  <TeamScopeHeader :detail="detail" :loaded="loaded" :error="error" :group-id="groupId">
    <ConnectorScopeView />
  </TeamScopeHeader>
</template>
