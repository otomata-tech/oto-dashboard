<script setup lang="ts">
// Bascule « vide assumé » d'un champ (oto#213) : active, l'écriture déclare le champ vide
// VOLONTAIREMENT (`@empty`) ; saisir une valeur la désactive, et la désactiver sans valeur
// efface (`@clear`). L'appelant ne l'offre que là où le contrat accepte la sentinelle.
import { useI18n } from 'vue-i18n'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [actif: boolean] }>()
const { t } = useI18n()
</script>

<template>
  <button type="button" class="vat" :class="{ on: modelValue }" :aria-pressed="modelValue"
    :title="t('rowEditor.emptyAssumedHint')" @click="emit('update:modelValue', !modelValue)">
    {{ t('rowEditor.emptyAssumed') }}
  </button>
</template>

<style scoped>
.vat {
  flex: none; font: inherit; font-size: 10.5px; line-height: 1; white-space: nowrap;
  padding: 3px 8px; border: 1px solid var(--color-hair-soft); border-radius: var(--radius-pill);
  background: transparent; color: var(--color-mute); cursor: pointer;
}
.vat:hover { color: var(--color-ink); border-color: var(--color-hair); }
.vat.on { background: var(--color-saffron-soft); border-color: var(--color-saffron); color: var(--color-saffron-ink); }
</style>
