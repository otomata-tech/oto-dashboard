<script setup lang="ts">
// Abonnement de l'ORG active (ADR 0043) — PSP Mollie. Scopé à l'org consultée
// (X-Oto-Org injecté par api()). Souscrire/résilier/changer de carte = org_admin ;
// consulter = tout membre. v1 = carte (« v1 CB seule ») : le paiement + le moyen de
// paiement récurrent se font sur la page de checkout hébergée Mollie.
//
// Cette vue porte l'état d'abonnement, ses alertes et le RETOUR du paiement ; le
// tunnel, le catalogue, le journal et le retour d'un changement de carte vivent dans
// `components/console/billing/`.
//
// ⚠️ **Au retour, un paiement réussi ne produit jamais d'échec.** Toutes les branches
// d'avancement de `confirm` sont des 200 discriminées par `status`, et
// `pending_mandate` veut dire « encaissé, le moyen de paiement réutilisable n'existe
// pas encore chez le PSP » : on sonde, on n'annonce rien de négatif, et on ne
// repropose surtout pas de payer. C'est ce bouton reproposé qui a débité deux fois
// le premier client payant le 25/08/2026 (#127).
//
// ⚠️ **Une alerte qui réclame un geste porte son levier** — depuis #845, « résiliation
// programmée » offre de l'annuler et « paiement en échec » de changer de carte. Les
// refus du serveur s'affichent tels quels : ils sont écrits pour dire par où passer.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import Notice from '@/components/console/Notice.vue'
import StateError from '@/components/console/StateError.vue'
import SkeletonOverview from '@/components/console/SkeletonOverview.vue'
import BillingCatalogue from '@/components/console/billing/BillingCatalogue.vue'
import BillingCheckout from '@/components/console/billing/BillingCheckout.vue'
import BillingGranted from '@/components/console/billing/BillingGranted.vue'
import BillingIdentityForm from '@/components/console/billing/BillingIdentityForm.vue'
import BillingInvoices from '@/components/console/billing/BillingInvoices.vue'
import BillingMethodChange from '@/components/console/billing/BillingMethodChange.vue'
import BillingPaymentsCard from '@/components/console/billing/BillingPaymentsCard.vue'
import BillingPending from '@/components/console/billing/BillingPending.vue'
import BillingUsageCard from '@/components/console/billing/BillingUsageCard.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe, isSuperAdmin } from '@/composables/useMe'
import {
  getBilling, getBillingIdentity, getBillingPayments, confirmBilling, cancelBilling,
  resumeBilling, startBillingMethodChange,
} from '@/api/console'
import type {
  BillingStatus, BillingPlan, BillingPayment, BillingIdentityView, VatScheme,
} from '@/types/api'
import type { BillingMethodChangeResult } from '@/types/api.attendu'
import { PENDING_WINDOW_MS, VAT_SCHEME_LABEL, nextProbeDelayMs } from '@/lib/billingTunnel'
import { euros as euroCents } from '@/lib/euros'
import { explain, humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me } = useMe()

const status = ref<BillingStatus | null>(null)
const payments = ref<BillingPayment[]>([])
// La fiche d'identité de l'org abonnée (#128). Elle n'était lue QUE par le tunnel
// de souscription — et le tunnel disparaît une fois abonné : l'alerte « complétez
// l'identité » ne menait alors nulle part.
const identity = ref<BillingIdentityView | null>(null)
const identityError = ref<string | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
// Le refus d'un GESTE (annuler la résiliation, changer de carte), tel que le serveur
// l'a écrit. Inline et non en toast : il dit par où passer, il doit rester lisible.
const gestureError = ref<string | null>(null)
// Palier choisi = on est dans le tunnel. Retour au catalogue en le remettant à null.
const chosen = ref<BillingPlan | null>(null)

// Souscrire/résilier réservé à l'org_admin (le backend le garde aussi — l'UI ne
// fait que masquer les leviers).
const canManage = computed(() =>
  me.value?.org_role === 'org_admin' || isSuperAdmin(me.value))

const STATUS_TONE: Record<string, 'olive' | 'saffron' | 'terra' | 'ink'> = {
  active: 'olive', past_due: 'terra', incomplete: 'saffron', canceled: 'ink',
  pending: 'saffron', failed: 'terra',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Actif', past_due: 'Impayé', incomplete: 'En attente',
  canceled: 'Résilié', pending: 'En cours', failed: 'Échec',
}

// La RÈGLE d'écriture d'un montant (les centimes se montrent quand il y en a) vit dans
// `lib/euros` : une facture est opposable. Ne reste ici que le mot du CATALOGUE.
function euros(cents: number | null | undefined): string {
  return cents == null ? 'sur devis' : euroCents(cents)
}

function methodLabel(m: string | null | undefined): string {
  if (m === 'comp') return 'Offert'
  if (m === 'sepa') return 'Prélèvement SEPA'
  return 'Carte bancaire'
}

// Les gestes d'un abonné : réservés à l'org_admin, sans objet sur un abonnement
// offert, et fermés une fois l'abonnement clos (le serveur refuse aussi).
const canAct = computed(() => {
  const s = status.value
  return !!(s?.subscribed && canManage.value && !s.comp && s.status !== 'canceled')
})
// La phrase, ou la phrase et qui peut agir — sous la même forme pour les trois alertes.
function withLever(base: string, can: boolean, verb: string): string {
  return can ? `${base}.` : `${base} — seul un administrateur de l'organisation peut ${verb}.`
}

// Bandeau d'alerte de l'état abonné (résiliation programmée / impayé / échéance que
// le prélèvement ne pourra pas honorer). Chaque alerte porte son levier — ou nomme
// qui peut agir : le serveur réserve ces gestes à l'org_admin, et un bouton qui
// refuserait au clic serait la même impasse, une porte plus loin.
type Fix = 'identity' | 'resume' | 'method'
const alert = computed<{ tone: 'warn' | 'info'; text: string; fix?: Fix } | null>(() => {
  const s = status.value
  if (!s?.subscribed) return null
  if (s.canceled_at) {
    return { tone: 'warn', fix: canAct.value ? 'resume' : undefined,
      text: withLever(`Résiliation programmée — l'accès reste ouvert jusqu'au `
        + `${fmtDate(s.current_period_end)}, puis passage au niveau gratuit`,
      canAct.value, 'l\'annuler') }
  }
  if (s.status === 'past_due') {
    // Pendant le constat d'un changement de carte, c'est le bloc dessous qui porte le levier.
    return { tone: 'warn', fix: canAct.value && !methodInProgress.value ? 'method' : undefined,
      text: withLever(`Paiement en échec — un nouvel essai est en cours, l'accès est maintenu `
        + `jusqu'au ${fmtDate(s.grace_until)}`, canAct.value, 'changer de carte') }
  }
  // Un abonnement actif dont le TTC n'est pas calculable = une échéance que le
  // serveur ne pourra pas prélever. Le dire avant qu'elle tombe — et OUVRIR le
  // formulaire qui la débloque, dans la même phrase : une alerte qui réclame un
  // geste sans le rendre atteignable a laissé le seul abonné payant sans issue
  // pendant huit jours.
  if (s.vat_blocked) {
    const cause = s.vat_blocked === 'vat_consumer_unsupported'
      ? 'le numéro de TVA intracommunautaire de l\'organisation est requis'
      : 'l\'identité de facturation de l\'organisation est incomplète'
    return {
      tone: 'warn',
      fix: canManage.value ? 'identity' : undefined,
      text: withLever(`La prochaine échéance ne peut pas être calculée : ${cause}`,
        canManage.value, 'la corriger'),
    }
  }
  return null
})

// Prochaine échéance affichée seulement quand elle a du sens (abonnement actif non résilié).
const showNextBilling = computed(() => {
  const s = status.value
  return !!(s && !s.comp && s.status === 'active' && !s.canceled_at && s.next_billing_at)
})

// Ce qui sera réellement prélevé à la prochaine échéance (TTC), avec son régime —
// tous deux servis par l'API. `null` sur un abonnement offert : rien n'y transite.
const nextCharge = computed(() => {
  const s = status.value
  if (!s?.subscribed || s.comp || s.amount_ttc == null) return null
  return { ttc: s.amount_ttc, scheme: (s.vat_scheme ?? null) as VatScheme | null }
})

// La fiche d'identité n'est proposée qu'à un abonné PAYANT : sur un abonnement
// offert, rien n'est jamais prélevé — le serveur n'y pose d'ailleurs jamais de
// `vat_blocked`, et un formulaire de facturation sous « offert par Otomata »
// annoncerait une échéance qui n'existe pas.
const showIdentity = computed(() => !!status.value?.subscribed && !status.value.comp)

async function load() {
  loading.value = true
  error.value = null
  try {
    status.value = await getBilling()
    if (status.value.subscribed) {
      payments.value = (await getBillingPayments()).payments
    }
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loading.value = false
  }
  if (showIdentity.value) await loadIdentity()
}

// Relire l'état SANS `load()` : son squelette démonterait ce qui est sous les doigts.
async function refreshStatus() {
  try {
    status.value = await getBilling()
  } catch (e) {
    gestureError.value = explain(e)
  }
}

// Lecture À PART, et tolérante : l'identité complète l'écran, elle n'en est pas la
// condition. Si elle échoue, l'état d'abonnement et son alerte restent affichés —
// blanchir la page priverait justement l'abonné en difficulté de ce qu'il vient y
// lire.
async function loadIdentity() {
  identityError.value = null
  try {
    identity.value = await getBillingIdentity()
  } catch (e) {
    identity.value = null
    identityError.value = humanize(e)
  }
}

// La fiche décide du régime de TVA, donc du TTC de la prochaine échéance et de
// `vat_blocked` : l'état d'abonnement se RELIT après l'enregistrement, sinon
// l'alerte resterait affichée alors qu'elle vient d'être traitée.
async function onIdentitySaved(view: BillingIdentityView) {
  identity.value = view
  await refreshStatus()
  if (!gestureError.value) toast('identité de facturation enregistrée')
}

// Le lien de l'alerte mène au formulaire. Le défilement seul ne déplace pas le
// focus : au clavier, il désignerait un endroit qu'on ne peut pas atteindre.
function goToIdentity() {
  const card = document.getElementById('billing-identity')
  if (!card) return
  card.scrollIntoView({ behavior: 'smooth', block: 'start' })
  card.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
}

// ── retour de la page de paiement ────────────────────────────────────────────

// Branche d'attente en cours (spinner + re-sonde), ou null quand il n'y a rien à
// attendre. Tant qu'elle est posée, le catalogue est masqué : aucun bouton « payer »
// ne doit être atteignable pendant qu'un encaissement s'achève.
const pending = ref<'pending' | 'pending_mandate' | null>(null)
const givenUp = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let deadline = 0

function isWaiting(s: string): s is 'pending' | 'pending_mandate' {
  return s === 'pending' || s === 'pending_mandate'
}

// Une sonde de `confirm`. Se rappelle elle-même après le délai conseillé par le
// serveur, jusqu'à l'ouverture de l'abonnement ou l'épuisement de la fenêtre.
async function probe(paymentRef: string | null) {
  try {
    const r = await confirmBilling(paymentRef)
    if (isWaiting(r.status)) {
      pending.value = r.status
      if (Date.now() >= deadline) {
        // On cesse de sonder, mais surtout pas en annonçant un échec : l'argent est
        // pris et la reprise est côté serveur (`billing_runner`).
        givenUp.value = true
        return
      }
      timer = setTimeout(() => probe(paymentRef), nextProbeDelayMs(r.retry_after))
      return
    }
    pending.value = null
    toast(r.status === 'active' ? 'abonnement activé' : 'paiement non abouti')
    await load()
  } catch (e) {
    // `confirm` ne refuse que si l'APPEL est fautif (paiement inconnu, aucune
    // souscription en cours) — jamais parce qu'un paiement a réussi.
    pending.value = null
    toast(explain(e))
    await load()
  }
}

// Retour d'un CHANGEMENT DE CARTE (`?billing=method`) : le constat vit dans
// `BillingMethodChange`, monté sous l'alerte de l'abonné. Tant qu'il n'a pas conclu,
// aucun second « Changer de carte » n'est armé.
const methodReturn = ref<{ paymentRef: string | null } | null>(null)
const methodSettled = ref(false)
const methodInProgress = computed(() => !!methodReturn.value && !methodSettled.value)

async function onMethodSettled(r: BillingMethodChangeResult | null) {
  methodSettled.value = true
  // La bascule a eu lieu : le moyen affiché (et un `past_due` réparé, plus tard, par
  // le prochain encaissement) se relit côté serveur.
  if (r && (r.status === 'changed' || r.status === 'already_current')) await refreshStatus()
}

onMounted(async () => {
  const url = new URL(window.location.href)
  const back = url.searchParams.get('billing')
  if (back === 'return' || back === 'method') {
    // `payment_ref` est posé par le serveur sur l'URL de retour : le navigateur DIT
    // quel paiement il vient de conclure, au lieu de laisser le serveur prendre « le
    // plus récent ». Les deux paramètres sont nettoyés de la barre d'adresse.
    const paymentRef = url.searchParams.get('payment_ref')
    url.searchParams.delete('billing')
    url.searchParams.delete('payment_ref')
    window.history.replaceState({}, '', url.toString())
    if (back === 'method') {
      methodReturn.value = { paymentRef }
    } else {
      deadline = Date.now() + PENDING_WINDOW_MS
      loading.value = false
      await probe(paymentRef)
      if (pending.value) return   // l'attente s'affiche seule, `load` viendra à la fin
    }
  }
  await load()
})

onBeforeUnmount(() => clearTimeout(timer))

// ── les gestes de l'abonné ───────────────────────────────────────────────────

const returnUrl = `${window.location.origin}/org/billing?billing=return`
const methodReturnUrl = `${window.location.origin}/org/billing?billing=method`

async function resiliate() {
  if (!await confirmAction({
    title: 'Résilier l\'abonnement', danger: true, confirmLabel: 'Résilier',
    message: 'l\'accès reste ouvert jusqu\'à la fin de la période en cours, '
      + 'puis repasse au niveau gratuit. rien n\'est supprimé.',
  })) return
  busy.value = true
  gestureError.value = null
  try {
    status.value = await cancelBilling()
    toast('résiliation enregistrée')
  } catch (e) {
    toast(explain(e))
  } finally {
    busy.value = false
  }
}

// L'inverse de la résiliation (#845 ②). Rien n'est encaissé : l'abonnement reprend
// son cycle. Sans dialogue — le geste se défait d'un clic, comme il s'est fait. Le
// refus d'une période échue (`already_ended`) dit de repasser par une souscription :
// on l'affiche tel quel, avec de quoi relire l'état.
async function resume() {
  busy.value = true
  gestureError.value = null
  try {
    status.value = await resumeBilling()
    toast('résiliation annulée')
  } catch (e) {
    gestureError.value = explain(e)
  } finally {
    busy.value = false
  }
}

// Changer de carte (#845 ①) : le serveur ouvre un premier paiement à 0,00 chez le
// PSP et rend la page où le conclure. ⚠️ Sa phrase (`notice`) s'affiche AVANT la
// redirection, dans le dialogue de confirmation : l'ancien moyen reste actif tant
// que le nouveau n'est pas confirmé — sans elle, qui abandonne croit s'être coupé.
async function changeMethod() {
  busy.value = true
  gestureError.value = null
  try {
    const started = await startBillingMethodChange(methodReturnUrl)
    if (!started.checkout_url) throw new Error('checkout_url absent de la réponse')
    if (!await confirmAction({
      title: 'Changer de carte', message: started.notice,
      confirmLabel: 'Continuer vers la page de paiement',
    })) return
    window.location.href = started.checkout_url
  } catch (e) {
    gestureError.value = explain(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <!-- Attente d'ouverture : elle remplace tout le reste, y compris le catalogue. -->
  <div v-if="pending" class="content-inner fadein">
    <BillingPending :status="pending" :given-up="givenUp" />
  </div>

  <!-- Tunnel du palier choisi (identité → montant → consentement → paiement). -->
  <BillingCheckout v-else-if="chosen" :plan="chosen" :can-manage="canManage"
    :return-url="returnUrl" @back="chosen = null" />

  <div v-else class="content-inner fadein">
    <SkeletonOverview v-if="loading" />
    <StateError v-else-if="error" :message="error" @retry="load" />

    <template v-else-if="status">
      <!-- ── Ce qui est offert ──
           AU-DESSUS du catalogue, et le catalogue RESTE affiché dessous : un don
           n'est pas un abonnement, et la voie pour en prendre un ne doit pas se
           refermer. C'est même tout l'enjeu — faute qu'un don écrive la moindre
           ligne d'abonnement, cet écran vendait à ses bénéficiaires, prix affichés
           et bouton armé, exactement ce qu'ils possédaient déjà. -->
      <BillingGranted v-if="status.granted?.length" :grants="status.granted" />

      <!-- ── Abonné : état courant ── -->
      <ConsoleCard v-if="status.subscribed" :title="status.label ?? 'Abonnement'"
        :sub="`abonnement de « ${me?.active_org_name ?? '' } »`">
        <template #actions>
          <Tag v-if="status.comp" tone="cobalt">offert par Otomata</Tag>
          <Tag v-else-if="status.status" :tone="STATUS_TONE[status.status] ?? 'ink'">
            {{ STATUS_LABEL[status.status] ?? status.status }}</Tag>
        </template>

        <div class="grid3">
          <Stat label="montant"
            :value="euros(nextCharge?.ttc ?? status.amount)"
            :sub="nextCharge ? 'par mois, TTC' : status.amount ? 'par mois' : undefined" />
          <Stat v-if="showNextBilling" label="prochaine échéance"
            :value="fmtDate(status.next_billing_at) ?? '—'" />
          <Stat label="paiement" :value="methodLabel(status.method)" />
        </div>

        <p v-if="nextCharge?.scheme" class="hint">
          {{ VAT_SCHEME_LABEL[nextCharge.scheme] }} —
          {{ euros(status.amount) }} hors taxes.
        </p>

        <Notice v-if="alert" :tone="alert.tone" class="mt">
          {{ alert.text }}
          <Btn v-if="alert.fix === 'identity'" kind="link" icon="chev" class="notice-fix"
            @click="goToIdentity">Compléter l'identité de facturation</Btn>
          <Btn v-else-if="alert.fix === 'resume'" kind="link" icon="chev" class="notice-fix"
            :disabled="busy" @click="resume">Annuler la résiliation</Btn>
          <Btn v-else-if="alert.fix === 'method'" kind="link" icon="card" class="notice-fix"
            :disabled="busy" @click="changeMethod">Changer de carte</Btn>
        </Notice>

        <!-- Le constat d'un changement de carte, au retour de la page de paiement. -->
        <BillingMethodChange v-if="methodReturn" :key="methodReturn.paymentRef ?? ''"
          :payment-ref="methodReturn.paymentRef" class="mt"
          @settled="onMethodSettled" @retry="changeMethod" />

        <!-- Le refus d'un geste, tel que le serveur l'a écrit — il nomme ce qui bloque
             et par où passer ; relire l'état est le geste qui suit. -->
        <Notice v-if="gestureError" tone="warn" class="mt">
          {{ gestureError }}
          <Btn kind="link" icon="chev" class="notice-fix" @click="load">Actualiser</Btn>
        </Notice>

        <div v-if="canAct" class="row-actions">
          <!-- En impayé, c'est l'alerte qui porte « Changer de carte » ; pendant un
               constat de retour, le bloc au-dessus le porte. -->
          <Btn v-if="status.status !== 'past_due' && !methodInProgress" kind="ghost" icon="card"
            :disabled="busy" @click="changeMethod">Changer de carte</Btn>
          <Btn v-if="!status.canceled_at" kind="danger" icon="trash" :disabled="busy"
            @click="resiliate">Résilier l'abonnement</Btn>
        </div>
        <p v-else-if="status.comp" class="hint">
          Cet abonnement est offert par Otomata — aucun paiement, aucune échéance.
        </p>
      </ConsoleCard>

      <!-- ── Pas abonné : catalogue des plans ── -->
      <BillingCatalogue v-else :plans="status.plans ?? []" :can-manage="canManage"
        @choose="chosen = $event" />

      <!-- ── Identité de facturation ──
           Le MÊME formulaire que le tunnel, monté ici pour un abonné : le tunnel
           n'existe qu'avant la souscription, et c'est pourtant après qu'une adresse
           change, qu'un numéro de TVA arrive, et que l'échéance suivante en dépend.
           Un seul composant, une seule règle de saisie — deux copies divergeraient. -->
      <ConsoleCard v-if="showIdentity" id="billing-identity" title="Identité de facturation"
        sub="elle figure sur les factures, et son pays décide de la TVA de la prochaine échéance.">
        <Notice v-if="identityError" tone="warn">
          {{ identityError }}
          <Btn kind="link" icon="chev" class="notice-fix" @click="loadIdentity">Réessayer</Btn>
        </Notice>
        <BillingIdentityForm v-else :view="identity" :can-manage="canManage"
          @saved="onIdentitySaved" />
      </ConsoleCard>

      <!-- ── Utilisation du mois ──
           Servie à TOUT LE MONDE, gratifié ou non, abonné ou non : c'est le seul
           bloc de cet écran qui vaut pour tous les comptes. -->
      <BillingUsageCard v-if="status.usage" :usage="status.usage" />

      <!-- ── Factures ── AU-DESSUS du journal : la facture est le document que les CGV
           promettent téléchargeable, le journal dessous n'est que la suite des tentatives.
           Sans condition d'abonnement — « reste téléchargeable » vaut après résiliation. -->
      <BillingInvoices :paying="!!status.subscribed && !status.comp" />

      <!-- ── Historique des paiements ── -->
      <BillingPaymentsCard v-if="status.subscribed && payments.length" :payments="payments" />
    </template>
  </div>
</template>

<style scoped>
/* Le lien d'action d'une alerte prend la couleur de l'alerte : un lien saffron sur
   fond terra ferait un troisième ton dans un encadré qui n'en dit qu'un. */
.notice-fix {
  margin-left: 6px; color: inherit; text-decoration: underline; text-underline-offset: 2px;
}
.notice-fix:hover { color: inherit; opacity: 0.75; }

.mt { margin-top: 14px; }
.row-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.hint { font-size: 12px; color: var(--color-mute); margin: 14px 0 0; line-height: 1.5; }
</style>
