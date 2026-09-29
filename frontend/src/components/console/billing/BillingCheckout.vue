<script setup lang="ts">
// Le tunnel de souscription d'un nombre de membres, en UN écran (#127 + #128).
//
// L'ordre n'est pas cosmétique : **identité → montant annoncé → consentement →
// paiement**. On accepte des CGV *pour un montant*, et le montant n'existe qu'une fois le
// pays connu (c'est lui qui décide de la TVA).
//
// Tout vient d'oto-commerce : la fiche (`GET /orgs/{id}/identite`), les documents d'achat
// (`GET /api/cgv`), et la souscription elle-même (`POST /orgs/{id}/abonnement`), qui
// porte l'acceptation des documents à leur version. L'écran se peint À FROID (fiche +
// documents) pour ne pas avoir besoin d'un refus pour savoir quoi demander ; un refus qui
// nomme un préalable repeint le bloc concerné.
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
import { getCgv, getIdentite, souscrire } from '@/api/console'
import {
  acceptationsOf, blockersOf, cgvDocs, priceParts, taxPreview, type TunnelDoc,
} from '@/lib/billingTunnel'
import { euros } from '@/lib/euros'
import { explain, humanize } from '@/lib/errors'
import type { CommerceIdentiteVue, CommerceTarif } from '@/types/api.commerce'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  orgId: number
  /** Le nombre de membres payants choisi. */
  places: number
  tarif: CommerceTarif
}>()
// Retour à l'état de l'org, relu : changer le nombre, ou constater qu'un abonnement existe.
const emit = defineEmits<{ back: [] }>()

const loading = ref(true)
const loadError = ref<string | null>(null)
const identity = ref<CommerceIdentiteVue | null>(null)
const docs = ref<TunnelDoc[]>([])
const accepted = ref(false)
// Champs SURLIGNÉS. Distinct de `manquants` : la fiche vide en sert cinq dès le premier
// affichage, et peindre en rouge un formulaire auquel personne n'a touché est une
// alarme sans fait. Le surlignage n'apparaît qu'après un refus.
const highlight = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
// Souscrire n'a plus d'objet, et le commerce le dit en 409 : l'org a déjà un abonnement
// vivant (`subscription_alive`), ou un premier paiement est encore ouvert chez le PSP
// (`payment_pending`) — en rouvrir un ferait payer deux fois (#127) —, ou un contrat
// hors plateforme court (`under_contract`, posé entre la lecture de l'état et le clic).
// Le refus s'affiche tel quel (le contrat, par sa clé i18n : le détail du serveur ne dit
// que l'id de l'org), le bouton ne revient pas de lui-même, et le geste est de relire
// l'état — qui montre alors le contrat.
const alive = ref<string | null>(null)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const [vue, cgv] = await Promise.all([getIdentite(props.orgId), getCgv()])
    identity.value = vue
    docs.value = cgvDocs(cgv)
  } catch (e) {
    loadError.value = humanize(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const missing = computed(() => identity.value?.manquants ?? [])
// Le régime et le taux que la fiche ouvre (miroir de la règle du commerce).
const tax = computed(() => taxPreview(identity.value))
const price = computed(() =>
  priceParts(props.places * props.tarif.prix_ht_par_place, tax.value.rateBps))

const canPay = computed(() =>
  !busy.value && !alive.value && !tax.value.blocked
  && (docs.value.length === 0 || accepted.value))

function onIdentitySaved(vue: CommerceIdentiteVue) {
  identity.value = vue
  highlight.value = []
  error.value = null
}

async function pay() {
  busy.value = true
  error.value = null
  try {
    // Le consentement est le dernier geste avant la page de paiement, et il part DANS
    // la souscription : la version de chaque document tel qu'il a été montré.
    const started = await souscrire(props.orgId, {
      places: props.places, methode: 'card', acceptations: acceptationsOf(docs.value),
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
  if (blockers?.identity) {
    // La liste des champs se relit sur la fiche (`manquants`), la même que celle que le
    // refus nomme en prose.
    try {
      identity.value = await getIdentite(props.orgId)
      highlight.value = identity.value.manquants
    } catch { /* la fiche reste celle affichée */ }
    error.value = t('billingUi.checkout.remaining', { items: t('billingUi.checkout.identity') })
    return
  }
  if (blockers?.legal) {
    // Un document a changé de version entre l'affichage et le clic : on repeint la
    // liste en vigueur, et la case se recoche en connaissance de cause.
    try { docs.value = cgvDocs(await getCgv()) } catch { /* la liste reste celle affichée */ }
    accepted.value = false
    error.value = t('billingUi.checkout.docsChanged')
    return
  }
  if (e instanceof ApiError && e.code === 'under_contract') {
    alive.value = humanize(e)
    return
  }
  if (e instanceof ApiError && (e.code === 'subscription_alive' || e.code === 'payment_pending')) {
    alive.value = explain(e)
    return
  }
  // Le refus du commerce est affiché tel quel : il nomme ce qui bloque.
  error.value = explain(e)
}
</script>

<template>
  <div class="content-inner fadein">
    <SkeletonOverview v-if="loading" />
    <StateError v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else>
      <!-- ── 1. Identité de facturation ── -->
      <ConsoleCard :title="t('billingUi.checkout.identityTitle')"
        :sub="t('billingUi.checkout.identitySub')">
        <template #actions>
          <Btn kind="link" icon="chev" @click="emit('back')">{{ t('billingUi.checkout.changeSeats') }}</Btn>
        </template>
        <BillingIdentityForm :org-id="orgId" :view="identity" :can-manage="true"
          :highlight="highlight" @saved="onIdentitySaved" />
      </ConsoleCard>

      <!-- ── 2. Le montant, avant tout consentement ── -->
      <BillingPriceCard :places="places" :price="price" :scheme="tax.scheme"
        :blocked="tax.blocked" />

      <!-- ── 3. Consentement, dernier geste avant la page de paiement ── -->
      <ConsoleCard v-if="docs.length" :title="t('billingUi.checkout.terms')"
        :sub="t('billingUi.checkout.termsSub')">
        <BillingLegalConsent v-model="accepted" :documents="docs" :busy="busy" />
      </ConsoleCard>

      <!-- ── 4. Paiement ── -->
      <ConsoleCard :title="t('billingUi.checkout.payment')"
        :sub="t('billingUi.checkout.paymentSub')">
        <Notice v-if="alive" tone="warn">
          {{ alive }}
          <Btn kind="link" icon="chev" class="bck-fix" @click="emit('back')">{{ t('billingUi.view.refresh') }}</Btn>
        </Notice>
        <Notice v-else-if="error" tone="warn">{{ error }}</Notice>

        <div v-if="!alive" class="bck-pay">
          <Btn icon="card" :disabled="!canPay" @click="pay">
            {{ price ? t('billingUi.checkout.payAmount', { amount: euros(price.ttc) }) : t('billingUi.checkout.pay') }}
          </Btn>
          <span v-if="!canPay && !busy" class="helptext">{{
            missing.length || tax.blocked
              ? t('billingUi.checkout.completeIdentity')
              : t('billingUi.checkout.acceptTerms')
          }}</span>
        </div>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.bck-pay { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
.bck-fix {
  margin-left: 6px; color: inherit; text-decoration: underline; text-underline-offset: 2px;
}
</style>
