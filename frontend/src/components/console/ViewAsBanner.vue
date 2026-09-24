<script setup lang="ts">
// Bandeau permanent « voir en tant que » (ADR 0023, axe user). Lecture seule par défaut.
// Lu au montage (localStorage non réactif) — l'entrée/sortie de la consultation
// recharge la page, donc le bandeau reflète toujours l'état courant.
//
// Écrire en tant que (24/09/2026) : au super_admin seulement, un geste d'acceptation
// explicite ouvre l'écriture au nom de la cible (header `X-Oto-View-As-Write`, cf.
// `viewOrg.ts`). L'acceptation vit en mémoire : elle tombe au rechargement, en quittant
// la vue et en changeant de cible. Le serveur reste l'autorité (403 si non super_admin).
import { ref, watch } from 'vue'
import {
  acceptViewAsWrite, getViewUser, revokeViewAsWrite, setViewUser,
  viewAsWriteAccepted, viewAsWriteRequests,
} from '@/lib/viewOrg'
import { usePrompt } from '@/composables/usePrompt'

const viewing = ref(getViewUser())
const writing = ref(viewAsWriteAccepted())
const canOfferWrite = !!viewing.value?.operator?.superAdmin
const { confirmAction } = usePrompt()

function quit() {
  setViewUser(null)
  window.location.href = '/platform/users'
}

async function askWrite() {
  const cible = viewing.value
  if (!cible || !canOfferWrite || writing.value) return
  const toi = cible.operator?.name || 'toi'
  const ok = await confirmAction({
    title: `Écrire en tant que ${cible.name} ?`,
    message:
      `Chaque modification sera faite au nom de ${cible.name} et journalisée « par ${toi} ` +
      `en tant que ${cible.name} », visible par son organisation. L'écriture reste ouverte ` +
      `jusqu'à ce que tu reviennes en lecture seule, quittes la vue ou recharges la page.`,
    confirmLabel: `Écrire en tant que ${cible.name}`,
    danger: true,
  })
  if (!ok) return
  acceptViewAsWrite()
  writing.value = viewAsWriteAccepted()
}

function backToReadOnly() {
  revokeViewAsWrite()
  writing.value = false
}

// Une écriture refusée faute d'acceptation (403 `view_as_read_only`) : on propose le geste.
watch(viewAsWriteRequests, () => { void askWrite() })
</script>

<template>
  <div v-if="viewing" class="viewas-banner" :class="{ 'viewas-banner--write': writing }">
    <span v-if="writing">✎&nbsp; tu écris en tant que <strong>{{ viewing.name }}</strong> — chaque modification est journalisée à ton nom</span>
    <span v-else>👁&nbsp; tu vois en tant que <strong>{{ viewing.name }}</strong> — lecture seule</span>
    <button v-if="writing" type="button" data-test="viewas-readonly" @click="backToReadOnly">Revenir en lecture seule</button>
    <button v-else-if="canOfferWrite" type="button" data-test="viewas-write" @click="askWrite">Écrire en tant que {{ viewing.name }}</button>
    <button type="button" @click="quit">Quitter</button>
  </div>
</template>

<style scoped>
.viewas-banner {
  position: fixed; top: 0; left: 0; right: 0; z-index: var(--z-banner);
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 8px 16px; font-size: 13px; font-weight: 500;
  background: var(--color-saffron, #e8a13a); color: #1a1205;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
}
.viewas-banner--write {
  background: var(--color-destructive, #b42318); color: #fff;
}
.viewas-banner button {
  border: 1px solid currentColor; background: transparent; color: inherit;
  border-radius: 6px; padding: 2px 10px; cursor: pointer; font: inherit; font-weight: 600;
}
.viewas-banner button:hover { background: rgba(0, 0, 0, 0.12); }
</style>
