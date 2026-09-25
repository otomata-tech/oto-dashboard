<script setup lang="ts">
// « Laisser vide » (oto#213, oto#140) : une option DU CHAMP, posée sous sa saisie. Active,
// l'écriture déclare le champ vide VOLONTAIREMENT (`@empty`, « cherché, rien trouvé ») ;
// saisir une valeur la désactive, et l'annuler sans valeur efface (`null`).
// Elle n'est offerte que sur un champ VIDE (ou déjà laissé vide) : sur un champ rempli,
// une bascule flottante à côté du libellé se lisait comme un badge d'état. L'appelant ne
// l'offre que là où le contrat accepte le marqueur, jamais sur la colonne de statut.
import { useI18n } from 'vue-i18n'

defineProps<{
  modelValue: boolean
  vide: boolean                  // la saisie du champ est vide
  raison?: string | null         // le commentaire de la case, s'il dit pourquoi
}>()
const emit = defineEmits<{ 'update:modelValue': [actif: boolean] }>()
const { t } = useI18n()
</script>

<template>
  <p v-if="modelValue" class="lve lve--on">
    <span class="lve-txt">{{ raison ? t('rowEditor.leftEmptyWhy', { reason: raison }) : t('rowEditor.leftEmpty') }}</span>
    <button type="button" class="vat" aria-pressed="true" :title="t('rowEditor.undoLeaveEmptyHint')"
      @click="emit('update:modelValue', false)">{{ t('rowEditor.undoLeaveEmpty') }}</button>
  </p>
  <p v-else-if="vide" class="lve">
    <button type="button" class="vat" aria-pressed="false" :title="t('rowEditor.leaveEmptyHint')"
      @click="emit('update:modelValue', true)">{{ t('rowEditor.leaveEmpty') }}</button>
  </p>
</template>

<style scoped>
.lve { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin: 3px 0 0; font-size: 11.5px; }
.lve--on {
  padding: 3px 8px; border-radius: var(--radius-md);
  background: var(--color-saffron-soft); color: var(--color-saffron-ink);
}
.lve-txt { font-weight: 600; overflow-wrap: anywhere; }
.vat {
  font: inherit; background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--color-faint); text-decoration: underline dotted; text-underline-offset: 2px;
}
.vat:hover { color: var(--color-cobalt-ink); }
.lve--on .vat { color: var(--color-saffron-ink); }
.lve--on .vat:hover { color: var(--color-ink); }
</style>
