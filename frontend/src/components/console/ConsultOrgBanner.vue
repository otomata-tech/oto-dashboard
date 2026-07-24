<script setup lang="ts">
// Bandeau permanent « consultation d'org en lecture seule » (ADR 0023, axe ORG,
// opérateur plateforme non-membre). Pendant du ViewAsBanner (axe user), mais dérivé
// de `me` (réactif) : le backend pose `active_org_readonly` quand l'org active est
// consultée par un opérateur sans rôle réel dedans. Quitter = revenir à la maison
// (URL nue → plus de header X-Oto-Org).
import { computed } from 'vue'
import { useMe } from '@/composables/useMe'

const { me } = useMe()
const active = computed(() => me.value?.active_org_readonly === true)
const orgName = computed(() => me.value?.active_org_name || '')

function quit() {
  window.location.href = '/overview'
}
</script>

<template>
  <div v-if="active" class="consult-banner">
    <span>👁&nbsp; tu consultes l'org <strong>{{ orgName }}</strong> en lecture seule (opérateur)</span>
    <button type="button" @click="quit">Quitter</button>
  </div>
</template>

<style scoped>
.consult-banner {
  position: fixed; top: 0; left: 0; right: 0; z-index: var(--z-banner);
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 8px 16px; font-size: 13px; font-weight: 500;
  background: var(--color-saffron, #e8a13a); color: #1a1205;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
}
.consult-banner button {
  border: 1px solid currentColor; background: transparent; color: inherit;
  border-radius: 6px; padding: 2px 10px; cursor: pointer; font: inherit; font-weight: 600;
}
.consult-banner button:hover { background: rgba(0, 0, 0, 0.12); }
</style>
