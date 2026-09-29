<script setup lang="ts">
// L'écran d'une souscription OUVERTE mais pas encore active (`statut: incomplete`) : le
// payeur revient de la page de paiement, ou l'encaissement s'achève.
//
// ⚠️ **Un paiement reçu est une ATTENTE, jamais un échec.** L'argent est pris ; c'est le
// webhook du prestataire qui ouvre l'abonnement, quelques instants plus tard. Le
// 25/08/2026, l'écran a annoncé un échec 1,4 s après un encaissement réussi : le payeur a
// recliqué et a été débité deux fois (#127). D'où deux règles tenues ici — la copie ne
// parle jamais d'échec, et **aucun bouton de paiement n'est proposé** tant qu'elle dure.
//
// La vue relit l'abonnement (le webhook fait foi) ; passé la fenêtre, elle cesse de
// relire et rend la main avec une promesse tenable, et le geste de vérifier à nouveau.
import Btn from '@/components/console/Btn.vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import OtoLoading from '@/components/console/OtoLoading.vue'
import Notice from '@/components/console/Notice.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  /** Le dernier paiement de souscription, lu au journal : `en_vol` = pas encore conclu
   *  (le payeur est peut-être encore sur la page du prestataire) ; `paye` = encaissé,
   *  l'abonnement s'ouvre. */
  status: 'en_vol' | 'paye'
  /** La fenêtre de relecture est écoulée : on n'interroge plus, on annonce la suite. */
  givenUp: boolean
}>()
const emit = defineEmits<{ recheck: [] }>()
</script>

<template>
  <ConsoleCard :title="t('billingUi.pending.title')">
    <div class="bpg">
      <Notice v-if="status === 'paye'" tone="ok">
        {{ t('billingUi.pending.received') }}
      </Notice>

      <p v-if="givenUp" class="bpg-line">
        {{ status === 'paye' ? t('billingUi.pending.givenUp') : t('billingUi.pending.givenUpOpen') }}
        <Btn kind="link" icon="chev" class="bpg-fix" @click="emit('recheck')">
          {{ t('billingUi.pending.checkAgain') }}</Btn>
      </p>
      <template v-else>
        <OtoLoading :size="18" :label="status === 'paye'
          ? t('billingUi.pending.validating')
          : t('billingUi.pending.checking')" />
        <p class="bpg-line">
          <template v-if="status === 'paye'">
            {{ t('billingUi.pending.minutes') }}
          </template>
          <template v-else>
            {{ t('billingUi.pending.resume') }}
          </template>
        </p>
      </template>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.bpg { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
.bpg-line {
  margin: 0; font-size: var(--fs-small); color: var(--color-ink-soft);
  line-height: 1.6; text-wrap: pretty; max-width: 560px;
}
.bpg-fix {
  margin-left: 6px; color: inherit; text-decoration: underline; text-underline-offset: 2px;
}
</style>
