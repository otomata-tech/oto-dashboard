<script setup lang="ts">
// Bandeau permanent « voir en tant que » (ADR 0023, axe user). Lecture seule par défaut.
// Lu au montage (localStorage non réactif) — l'entrée/sortie de la consultation
// recharge la page, donc le bandeau reflète toujours l'état courant.
//
// Écrire en tant que (24/09/2026) : au super_admin seulement, un geste d'acceptation
// explicite ouvre l'écriture au nom de la cible (header `X-Oto-View-As-Write`, cf.
// `viewOrg.ts`). L'acceptation vit en mémoire : elle tombe au rechargement, en quittant
// la vue et en changeant de cible. Le serveur reste l'autorité (403 si non super_admin).
// Le DROIT d'écrire de l'écran ne se tire pas d'ici : à l'acceptation comme au retour en
// lecture seule, on relit `/api/me`, dont `view_as_read_only` décide (`canWriteInOrg`,
// oto#212). L'état local ne sert qu'à poser l'en-tête.
//
// Vue BORNÉE d'un org_admin (oto#270, `viewing.org`) : lecture seule, sans jamais d'offre
// d'écriture ; le bandeau nomme l'org, et « quitter » ramène à ses membres. Si le serveur
// refuse d'ouvrir la vue (`/api/me` en 400 `view_as_org_required` ou 403 `view_as_hors_org`
// / `forbidden` : la cible est opérateur plateforme, n'est plus membre, ou l'appelant n'est
// plus admin), le bandeau le dit et propose de quitter — l'écran derrière n'a rien à montrer.
import { computed, ref, watch } from 'vue'
import {
  acceptViewAsWrite, getViewUser, revokeViewAsWrite, setViewUser,
  viewAsWriteAccepted, viewAsWriteRequests,
} from '@/lib/viewOrg'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const viewing = ref(getViewUser())
const writing = ref(viewAsWriteAccepted())
const canOfferWrite = !!viewing.value?.operator?.superAdmin && !viewing.value?.org
const { confirmAction } = usePrompt()
const { reload, error: meError } = useMe()
const bornee = computed(() => viewing.value?.org ?? null)
// Le code du refus de `/api/me` (message `"<status> <code>"`), en vue bornée seulement.
const REFUS_OUVERTURE = ['view_as_org_required', 'view_as_hors_org', 'forbidden'] as const
const refusOuverture = computed(() => {
  if (!bornee.value || !meError.value) return null
  const code = meError.value.split(' ')[1] ?? ''
  return (REFUS_OUVERTURE as readonly string[]).includes(code) ? code : null
})

function quit() {
  const retour = bornee.value ? '/org' : '/platform/users'
  setViewUser(null)
  window.location.href = retour
}

async function askWrite() {
  const cible = viewing.value
  if (!cible || !canOfferWrite || writing.value) return
  const toi = cible.operator?.name || t('orgUi.viewAs.you')
  const ok = await confirmAction({
    title: t('orgUi.viewAs.askTitle', { name: cible.name }),
    message: t('orgUi.viewAs.askMessage', { name: cible.name, you: toi }),
    confirmLabel: t('orgUi.viewAs.writeAs', { name: cible.name }),
    danger: true,
  })
  if (!ok) return
  acceptViewAsWrite()
  writing.value = viewAsWriteAccepted()
  await reload()
}

async function backToReadOnly() {
  revokeViewAsWrite()
  writing.value = false
  await reload()
}

// Une écriture refusée faute d'acceptation (403 `view_as_read_only`) : on propose le geste.
watch(viewAsWriteRequests, () => { void askWrite() })
</script>

<template>
  <div v-if="viewing" class="viewas-banner" :class="{ 'viewas-banner--write': writing }">
    <span v-if="refusOuverture" data-test="viewas-refus">{{ t(`viewAsOrg.refused.${refusOuverture}`, { name: viewing.name }) }}</span>
    <span v-else-if="bornee"><i18n-t keypath="viewAsOrg.viewing" tag="span"><template #name><strong>{{ viewing.name }}</strong></template><template #org><strong>{{ bornee.name }}</strong></template></i18n-t></span>
    <span v-else-if="writing"><i18n-t keypath="orgUi.viewAs.writing" tag="span"><template #name><strong>{{ viewing.name }}</strong></template></i18n-t></span>
    <span v-else><i18n-t keypath="orgUi.viewAs.viewing" tag="span"><template #name><strong>{{ viewing.name }}</strong></template></i18n-t></span>
    <button v-if="writing" type="button" data-test="viewas-readonly" @click="backToReadOnly">{{ t('orgUi.viewAs.backToRead') }}</button>
    <button v-else-if="canOfferWrite" type="button" data-test="viewas-write" @click="askWrite">{{ t('orgUi.viewAs.writeAs', { name: viewing.name }) }}</button>
    <button type="button" @click="quit">{{ t('orgUi.viewAs.quit') }}</button>
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
