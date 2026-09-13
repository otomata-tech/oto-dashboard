<script setup lang="ts">
// Un refus du serveur, TEL QU'IL L'A ÉCRIT (oto#205, lot 2) : le `detail` mot pour mot,
// puis le code. Le remplacer par une phrase générique jetterait la seule information
// utile — `no_runner_armed` dit quoi armer, `invalid_schedule` quel champ est fautif,
// `not_launchable` dans quel état est la campagne.
//
// Plusieurs de ces codes ne figurent dans aucun OpenAPI (`model_key_required`,
// `org_admin_required`, `not_launchable`…) : ils ne sont pas typés, ils se lisent par
// l'enveloppe d'erreur générique.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Refus } from '@/lib/runnerGestes'

const props = defineProps<{ refus: Refus }>()
const { t } = useI18n()
// Sans détail rédigé, le texte est déjà « 400 <code> » : le code ne se répète pas.
const code = computed(() =>
  props.refus.code && !props.refus.texte.includes(props.refus.code) ? props.refus.code : null)
</script>

<template>
  <p class="refus" role="alert">
    {{ t('automations.actions.refused', { reason: refus.texte }) }}
    <code v-if="code" class="refus-code">{{ code }}</code>
  </p>
</template>

<style scoped>
.refus { margin: 0; font-size: 12px; line-height: 1.5; color: var(--color-terra-ink); text-wrap: pretty; }
.refus-code { font-family: var(--font-mono, monospace); font-size: 11px; margin-left: 4px; }
</style>
