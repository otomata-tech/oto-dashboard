<script setup lang="ts">
// TROISIÈME écran du tunnel (#127) : le retour de la page de paiement, quand
// l'abonnement n'est pas encore ouvert.
//
// ⚠️ **`pending_mandate` est une ATTENTE, jamais un échec.** L'argent est pris ; le
// moyen de paiement réutilisable, lui, n'existe chez le prestataire que quelques
// minutes plus tard. Le 25/08/2026, l'écran a annoncé un échec 1,4 s après un
// encaissement réussi : le payeur a recliqué et a été débité deux fois. D'où deux
// règles tenues ici — la copie ne parle jamais d'échec sur cette branche, et
// **aucun bouton de paiement n'est proposé** tant qu'elle dure.
//
// Passé la fenêtre de reprise du serveur, on cesse de sonder et on rend la main
// avec une promesse tenable : c'est encaissé, l'ouverture se fait sans le payeur.
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import OtoLoading from '@/components/console/OtoLoading.vue'
import Notice from '@/components/console/Notice.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  /** Branche servie par `confirm` : 'pending' = pas encore encaissé (le payeur est
   *  peut-être encore sur la page du prestataire) ; 'pending_mandate' = encaissé,
   *  moyen de paiement en cours de validation. */
  status: 'pending' | 'pending_mandate'
  /** La fenêtre de sonde est écoulée : on n'interroge plus, on annonce la suite. */
  givenUp: boolean
}>()
</script>

<template>
  <ConsoleCard :title="t('billingUi.pending.title')">
    <div class="bpg">
      <Notice v-if="status === 'pending_mandate'" tone="ok">
        {{ t('billingUi.pending.received') }}
      </Notice>

      <p v-if="givenUp" class="bpg-line">
        {{ t('billingUi.pending.givenUp') }}
      </p>
      <template v-else>
        <OtoLoading :size="18" :label="status === 'pending_mandate'
          ? t('billingUi.method.validating')
          : t('billingUi.method.checking')" />
        <p class="bpg-line">
          <template v-if="status === 'pending_mandate'">
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
</style>
