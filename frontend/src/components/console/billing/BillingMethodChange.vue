<script setup lang="ts">
// Le RETOUR d'un changement de moyen de paiement (#845 ①). La moitié du geste s'est
// jouée chez le prestataire (un premier paiement à 0,00 — aucun mouvement d'argent) ;
// on constate ici ce qu'il en est, en sondant `confirm` comme le fait la souscription.
//
// ⚠️ **On RECOPIE ce que le serveur dit (`notice`)**, on ne le reformule pas : c'est
// lui qui sait si l'ancien moyen tient encore, et il l'écrit dans chaque branche.
// Une carte qui refuse l'autorisation à zéro n'a rien coûté — l'ancien moyen est
// intact — et aucune branche ici ne parle de coupure. `pending_mandate` est une
// ATTENTE, comme pour la souscription (#127) : jamais un échec.
//
// Passé la fenêtre de reprise du serveur, on cesse de sonder sans rien annoncer de
// négatif : la phrase servie (l'ancien moyen reste actif) reste affichée, et on offre
// de vérifier à nouveau.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Btn from '@/components/console/Btn.vue'
import Notice from '@/components/console/Notice.vue'
import OtoLoading from '@/components/console/OtoLoading.vue'
import { confirmBillingMethodChange } from '@/api/console'
import type { BillingMethodChangeResult } from '@/types/api.attendu'
import { PENDING_WINDOW_MS, nextProbeDelayMs } from '@/lib/billingTunnel'
import { explain } from '@/lib/errors'

const props = defineProps<{
  /** Le paiement que le NAVIGATEUR vient de conclure (`?payment_ref=`), posé par
   * le serveur sur l'URL de retour. `null` = le serveur prend le plus récent. */
  paymentRef: string | null
}>()
const emit = defineEmits<{
  /** La sonde a rendu un état final (ou un refus, `null`) : le parent peut relire
   * l'abonnement et réarmer ses leviers. */
  settled: [result: BillingMethodChangeResult | null]
  /** « Changer de carte » depuis un échec ou un refus : le parent rouvre le geste. */
  retry: []
}>()

const result = ref<BillingMethodChangeResult | null>(null)
const error = ref<string | null>(null)
const givenUp = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let deadline = 0

function isWaiting(s: string): boolean {
  return s === 'pending' || s === 'pending_mandate'
}

async function probe() {
  try {
    const r = await confirmBillingMethodChange(props.paymentRef)
    result.value = r
    if (isWaiting(r.status)) {
      if (Date.now() >= deadline) {
        givenUp.value = true
        emit('settled', r)
        return
      }
      // Le serveur ne conseille pas de cadence ici : celle par défaut de la souscription.
      timer = setTimeout(probe, nextProbeDelayMs(null))
      return
    }
    emit('settled', r)
  } catch (e) {
    // `confirm` ne refuse que si l'APPEL est fautif (paiement inconnu, aucun
    // changement en cours) — jamais parce qu'un paiement a réussi. Le refus est
    // écrit pour être lu : on l'affiche tel quel.
    error.value = explain(e)
    emit('settled', null)
  }
}

function start() {
  clearTimeout(timer)
  givenUp.value = false
  error.value = null
  deadline = Date.now() + PENDING_WINDOW_MS
  void probe()
}

onMounted(start)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="bmc">
    <Notice v-if="error" tone="warn">
      {{ error }}
      <Btn kind="link" icon="card" class="bmc-fix" @click="emit('retry')">Changer de carte</Btn>
    </Notice>

    <template v-else-if="result && isWaiting(result.status)">
      <OtoLoading v-if="!givenUp" :size="18" :label="result.status === 'pending_mandate'
        ? 'votre moyen de paiement est en cours de validation'
        : 'vérification du paiement'" />
      <p class="bmc-line">
        {{ result.notice }}
        <Btn v-if="givenUp" kind="link" icon="chev" class="bmc-fix" @click="start">
          Vérifier à nouveau</Btn>
      </p>
    </template>

    <Notice v-else-if="result?.status === 'failed'" tone="warn">
      {{ result.notice }}
      <Btn kind="link" icon="card" class="bmc-fix" @click="emit('retry')">Changer de carte</Btn>
    </Notice>

    <Notice v-else-if="result?.status === 'changed'" tone="ok">{{ result.notice }}</Notice>

    <!-- Rejeu sur le mandat courant : le serveur ne sert pas de phrase ici. -->
    <Notice v-else-if="result?.status === 'already_current'" tone="ok">
      Ce moyen de paiement est déjà celui de l'abonnement.
    </Notice>

    <!-- Une valeur de `status` que cet écran ne connaît pas : on montre ce que le
         serveur a écrit plutôt que de tourner sans fin. -->
    <Notice v-else-if="result" tone="info">{{ result.notice || result.status }}</Notice>

    <OtoLoading v-else :size="18" label="vérification du paiement" />
  </div>
</template>

<style scoped>
.bmc { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.bmc-line {
  margin: 0; font-size: var(--fs-small); color: var(--color-ink-soft);
  line-height: 1.6; text-wrap: pretty; max-width: 560px;
}
/* Le lien d'action prend la couleur de son encadré — un seul ton par alerte. */
.bmc-fix {
  margin-left: 6px; color: inherit; text-decoration: underline; text-underline-offset: 2px;
}
.bmc-fix:hover { color: inherit; opacity: 0.75; }
</style>
