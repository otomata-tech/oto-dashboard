<script setup lang="ts">
// Bandeau permanent « voir en tant que » (ADR 0023, axe user, lecture seule).
// Lu au montage (localStorage non réactif) — l'entrée/sortie de la consultation
// recharge la page, donc le bandeau reflète toujours l'état courant.
import { ref } from 'vue'
import { getViewUser, setViewUser } from '@/lib/viewOrg'

const viewing = ref(getViewUser())
function quit() {
  setViewUser(null)
  window.location.href = '/platform/users'
}
</script>

<template>
  <div v-if="viewing" class="viewas-banner">
    <span>👁&nbsp; tu vois en tant que <strong>{{ viewing.name }}</strong> — lecture seule</span>
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
