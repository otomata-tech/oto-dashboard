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
  <ConsoleCard title="Souscription en cours">
    <div class="bpg">
      <Notice v-if="status === 'pending_mandate'" tone="ok">
        Votre paiement a bien été reçu.
      </Notice>

      <p v-if="givenUp" class="bpg-line">
        Paiement reçu, activation en cours. Elle se termine sans vous : nous vous
        écrivons dès que votre abonnement est ouvert.
      </p>
      <template v-else>
        <OtoLoading :size="18" :label="status === 'pending_mandate'
          ? 'votre moyen de paiement est en cours de validation'
          : 'vérification du paiement'" />
        <p class="bpg-line">
          <template v-if="status === 'pending_mandate'">
            Cela prend quelques minutes. Votre abonnement s'ouvrira seul — inutile de
            payer à nouveau, ni de rester sur cette page.
          </template>
          <template v-else>
            Si vous n'avez pas terminé sur la page de paiement, reprenez-la dans
            l'onglet où elle est restée ouverte.
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
