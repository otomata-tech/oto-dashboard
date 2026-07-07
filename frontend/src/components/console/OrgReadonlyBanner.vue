<script setup lang="ts">
// Bandeau permanent « consultation d'org en lecture seule » (ADR 0023 + view-org
// opérateur plateforme). Se montre quand `me.active_org_readonly` = un admin
// plateforme navigue dans une org dont il n'est PAS membre (backend GET-only).
// Pendant du `ViewAsBanner` (axe user) sur l'axe org.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMe } from '@/composables/useMe'

const { me } = useMe()
const router = useRouter()

const readonly = computed(() => me.value?.active_org_readonly === true)
const orgName = computed(() => me.value?.active_org_name ?? 'cette organisation')

// Quitter = retour à la console admin des orgs (la consultation vit dans l'URL
// `/o/:orgId/…` — sortir du préfixe suffit à retomber sur la maison).
function quit() {
  router.push('/platform/orgs')
}
</script>

<template>
  <div v-if="readonly" class="viewas-banner">
    <span>👁&nbsp; tu consultes <strong>{{ orgName }}</strong> en lecture seule (admin)</span>
    <button type="button" @click="quit">Quitter</button>
  </div>
</template>

<style scoped>
.viewas-banner {
  position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 8px 16px; font-size: 13px; font-weight: 500;
  background: var(--color-saffron, #e8a13a); color: #1a1205;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
}
.viewas-banner button {
  border: 1px solid currentColor; background: transparent; color: inherit;
  border-radius: 6px; padding: 2px 10px; cursor: pointer; font: inherit; font-weight: 600;
}
.viewas-banner button:hover { background: rgba(0, 0, 0, 0.12); }
</style>
