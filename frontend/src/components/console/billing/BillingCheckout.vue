<script setup lang="ts">
// Le tunnel de souscription d'un palier, en UN écran (#127 + #128).
//
// L'ordre est celui du serveur, et il n'est pas cosmétique : **identité → montant
// annoncé → consentement → paiement**. On accepte des CGV *pour un montant*, et le
// montant n'existe qu'une fois le pays connu (c'est lui qui décide de la TVA).
//
// ⚠️ Les manques se peignent TOUS D'UN COUP. Le serveur les rend ensemble
// (`details.blockers`) précisément pour qu'un tunnel n'enchaîne pas « corrige
// l'identité » puis, au clic suivant, « ah, et coche aussi » — et l'écran se peint
// aussi À FROID (identité + statut légal) pour ne pas avoir besoin d'un refus pour
// savoir quoi demander.
import { computed, onMounted, ref } from 'vue'
import Btn from '@/components/console/Btn.vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Notice from '@/components/console/Notice.vue'
import StateError from '@/components/console/StateError.vue'
import SkeletonOverview from '@/components/console/SkeletonOverview.vue'
import BillingIdentityForm from './BillingIdentityForm.vue'
import BillingLegalConsent from './BillingLegalConsent.vue'
import BillingPriceCard from './BillingPriceCard.vue'
import { ApiError } from '@/api'
import { acceptLegal, getBillingIdentity, getLegal, subscribeBilling } from '@/api/console'
import { blockersOf, docsToAccept, priceParts, type TunnelDoc } from '@/lib/billingTunnel'
import { explain, humanize } from '@/lib/errors'
import type { BillingIdentityView, BillingPlan, VatBlocked, VatScheme } from '@/types/api'

const props = defineProps<{
  plan: BillingPlan
  /** Souscrire est réservé à l'org_admin (le serveur le garde aussi). */
  canManage: boolean
  returnUrl: string
}>()
const emit = defineEmits<{ back: [] }>()

const PURCHASE = 'purchase'

const loading = ref(true)
const loadError = ref<string | null>(null)
const identity = ref<BillingIdentityView | null>(null)
const docs = ref<TunnelDoc[]>([])
const accepted = ref(false)
// Champs SURLIGNÉS. Distinct de `missing` : la fiche vide en sert cinq dès le premier
// affichage, et peindre en rouge un formulaire auquel personne n'a touché est une
// alarme sans fait. Le surlignage n'apparaît qu'après un refus — quand le serveur a
// vraiment nommé ce qui manque.
const highlight = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
// Un paiement de cette org est déjà en vol : le serveur l'a dit, et rouvrir un
// checkout débiterait deux fois. Le bouton ne revient pas de lui-même (#127).
const paymentPending = ref<string | null>(null)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const [view, legal] = await Promise.all([getBillingIdentity(), getLegal()])
    identity.value = view
    docs.value = docsToAccept(legal, PURCHASE)
  } catch (e) {
    loadError.value = humanize(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Les champs requis encore absents — la liste que le serveur nomme, servie aussi
// bien à froid (`missing`) qu'au refus.
const missing = computed(() => identity.value?.missing ?? [])
// `vat_blocked` et `vat_scheme` sont déclarés `str` par le serveur là où le domaine
// est un ensemble fermé — on les resserre ici, comme `BillingStatus` le fait déjà.
const vatBlocked = computed(() => (identity.value?.vat_blocked ?? null) as VatBlocked | null)
const scheme = computed(() => (identity.value?.vat_scheme ?? null) as VatScheme | null)

// HT / TVA / TTC. Le taux et le régime viennent de l'API ; seul le rapprochement
// avec le prix du palier se fait ici (cf. l'avertissement de `billingTunnel`).
const price = computed(() => priceParts(props.plan.amount, identity.value?.vat_rate_bps))

const canPay = computed(() =>
  props.canManage && !busy.value && !paymentPending.value
  && missing.value.length === 0 && !vatBlocked.value
  && (docs.value.length === 0 || accepted.value))

function euros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function onIdentitySaved(view: BillingIdentityView) {
  identity.value = view
  highlight.value = []
  error.value = null
}

async function pay() {
  busy.value = true
  error.value = null
  try {
    // Le consentement est le dernier geste avant la page de paiement. La réponse
    // d'`accept` est le statut RAFRAÎCHI : s'il reste quelque chose, un document a
    // bougé entre l'affichage et le clic — on repeint au lieu de rejouer.
    if (docs.value.length) {
      const refreshed = await acceptLegal(PURCHASE)
      const remaining = docsToAccept(refreshed, PURCHASE)
      if (remaining.length) {
        docs.value = remaining
        accepted.value = false
        error.value = 'Ces documents ont changé à l\'instant : relisez-les et acceptez '
          + 'la version courante.'
        return
      }
      docs.value = []
    }
    const started = await subscribeBilling({
      plan: props.plan.plan, return_url: props.returnUrl, method: 'card',
    })
    window.location.href = started.checkout_url
  } catch (e) {
    await onRefused(e)
  } finally {
    busy.value = false
  }
}

async function onRefused(e: unknown) {
  const blockers = blockersOf(e)
  if (blockers) {
    // Peindre les deux manques d'un coup. La liste des champs se relit sur la fiche
    // (`missing`), qui est la même que celle nommée par le refus — le blocker, lui,
    // ne la porte qu'en prose.
    if (blockers.identity) {
      try {
        identity.value = await getBillingIdentity()
        highlight.value = identity.value.missing
      } catch { /* la fiche reste celle affichée */ }
    }
    if (blockers.legal) {
      docs.value = blockers.legal.documents
      accepted.value = false
    }
    // ⚠️ Le message du serveur n'est PAS affiché ici : il est écrit pour un client
    // d'API (« Enregistre-la avec POST /api/me/legal/accept… »). Ce que le payeur
    // doit lire, ce sont les blocs repeints — les champs surlignés et les documents
    // à ouvrir. La phrase ne fait que dire lesquels regarder.
    const reste = [
      blockers.identity ? 'l\'identité de facturation' : null,
      blockers.legal ? 'l\'acceptation des conditions' : null,
    ].filter(Boolean)
    error.value = `Avant le paiement, il reste ${reste.join(' et ')}.`
    return
  }
  // `payment_pending` : le refus dit quel paiement occupe la place, son âge et quoi
  // faire. Celui-là est rédigé pour être lu — on l'affiche tel quel, et on ne rouvre
  // pas de page de paiement.
  if (e instanceof ApiError && e.code === 'payment_pending') {
    paymentPending.value = explain(e)
    return
  }
  error.value = explain(e)
}
</script>

<template>
  <div class="content-inner fadein">
    <SkeletonOverview v-if="loading" />
    <StateError v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else>
      <!-- ── 1. Identité de facturation ── -->
      <ConsoleCard title="Identité de facturation"
        sub="le pays de facturation décide de la TVA, donc du montant réellement débité.">
        <template #actions>
          <Btn kind="link" icon="chev" @click="emit('back')">Changer de palier</Btn>
        </template>
        <BillingIdentityForm :view="identity" :can-manage="canManage" :highlight="highlight"
          @saved="onIdentitySaved" />
      </ConsoleCard>

      <!-- ── 2. Le montant, avant tout consentement ── -->
      <BillingPriceCard :plan-label="plan.label" :price="price" :scheme="scheme"
        :blocked="vatBlocked" />

      <!-- ── 3. Consentement, dernier geste avant la page de paiement ── -->
      <ConsoleCard v-if="docs.length" title="Conditions"
        sub="à accepter pour souscrire.">
        <BillingLegalConsent v-model="accepted" :documents="docs" :busy="busy" />
      </ConsoleCard>

      <!-- ── 4. Paiement ── -->
      <ConsoleCard title="Paiement"
        sub="le règlement se fait par carte bancaire, sur la page sécurisée de notre prestataire.">
        <Notice v-if="paymentPending" tone="warn">{{ paymentPending }}</Notice>
        <Notice v-else-if="error" tone="warn">{{ error }}</Notice>

        <div v-if="canManage && !paymentPending" class="bck-pay">
          <Btn icon="card" :disabled="!canPay" @click="pay">
            {{ price ? `Payer ${euros(price.ttc)} par mois` : 'Payer' }}
          </Btn>
          <span v-if="!canPay && !busy" class="helptext">{{
            missing.length || vatBlocked
              ? 'Complétez l\'identité de facturation ci-dessus.'
              : 'Acceptez les conditions pour continuer.'
          }}</span>
        </div>
        <p v-else-if="!canManage" class="helptext">
          Seul un administrateur de l'organisation peut souscrire.
        </p>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.bck-pay { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
</style>
