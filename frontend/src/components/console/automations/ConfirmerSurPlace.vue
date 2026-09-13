<script setup lang="ts">
// Une confirmation SUR PLACE, à l'endroit du geste (oto#205, lot 2) — jamais un
// dialogue natif du navigateur (règle de l'UI), jamais une modale qui cache ce qu'on
// s'apprête à changer. Le message dit ce que le geste engage ; le bouton porte le nom
// du geste, pas un « OK » qui ne dit rien.
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'

defineProps<{ message: string; action: string; danger?: boolean; busy?: boolean }>()
const emit = defineEmits<{ confirmer: []; annuler: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="csp" role="group" :aria-busy="busy || undefined">
    <p class="csp-msg">{{ message }}</p>
    <div class="csp-row">
      <Btn :kind="danger ? 'danger' : 'mini'" data-test="confirmer" :disabled="busy"
        @click="emit('confirmer')">{{ action }}</Btn>
      <Btn kind="link" data-test="annuler" :disabled="busy" @click="emit('annuler')">
        {{ t('common.cancel') }}</Btn>
    </div>
  </div>
</template>

<style scoped>
.csp {
  display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  background: var(--color-paper-2);
}
.csp-msg { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--color-ink); text-wrap: pretty; }
.csp-row { display: flex; align-items: center; gap: 12px; }
</style>
