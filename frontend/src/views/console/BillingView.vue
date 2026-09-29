<script setup lang="ts">
// Abonnement de l'ORG active — servi par OTO-COMMERCE (`oto-commerce/docs/api-utilisateur.md`),
// PSP Mollie. L'org est dans le chemin de chaque appel (`me.active_org`, la valeur de
// `useOrgScope().activeOrgId`, lue sans recharger le détail de l'org).
//
// Qui voit quoi, c'est le commerce qui le tranche, en relisant auprès du cœur le rôle du
// porteur du jeton dans l'org :
//   • l'org_admin : tout — l'abonnement, l'offre, l'identité, les paiements, les factures ;
//     une org SOUS CONTRAT (réglé hors plateforme, `GET /contrat`) voit son contrat À LA
//     PLACE de l'offre tant qu'il court : elle a déjà payé, et le commerce refuserait la
//     souscription (`409 under_contract`). Un contrat clos ne masque rien ;
//   • un membre : seulement s'il est payant, et jusqu'à quand (`GET /moi`) ;
//   • en consultation ou en « voir en tant que » : RIEN. Le commerce ne connaît pas ces
//     modes (le jeton reste celui de l'opérateur, qui n'est pas membre) : l'écran le dit
//     et renvoie à la fiche d'org de la plateforme, qui lit l'API d'administration.
//
// Cette vue porte l'état d'abonnement, ses alertes et l'attente d'ouverture ; l'offre,
// le tunnel, le journal et les factures vivent dans `components/console/billing/`.
//
// ⚠️ **Plus aucune confirmation côté client.** Au retour de la page de paiement, c'est le
// webhook du PSP qui ouvre l'abonnement : l'écran RELIT `GET /abonnement` jusqu'à ce
// qu'il quitte `incomplete` (ou que la fenêtre s'épuise). Tant qu'un paiement de
// souscription est en vol ou reçu, aucun bouton « payer » n'est atteignable — c'est un
// bouton reproposé qui a débité deux fois le premier client payant le 25/08/2026 (#127).
//
// ⚠️ **Une alerte qui réclame un geste porte son levier** (#845) : « résiliation
// programmée » offre de l'annuler, « paiement en échec » de changer de carte, « échéance
// incalculable » mène au formulaire. Les refus du serveur s'affichent tels quels.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import Notice from '@/components/console/Notice.vue'
import StateError from '@/components/console/StateError.vue'
import SkeletonOverview from '@/components/console/SkeletonOverview.vue'
import BillingCheckout from '@/components/console/billing/BillingCheckout.vue'
import BillingContract from '@/components/console/billing/BillingContract.vue'
import BillingGranted from '@/components/console/billing/BillingGranted.vue'
import BillingIdentityForm from '@/components/console/billing/BillingIdentityForm.vue'
import BillingInvoices from '@/components/console/billing/BillingInvoices.vue'
import BillingPaymentsCard from '@/components/console/billing/BillingPaymentsCard.vue'
import BillingPending from '@/components/console/billing/BillingPending.vue'
import BillingSeats from '@/components/console/billing/BillingSeats.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe, canWriteInOrg, isPlatformOperator } from '@/composables/useMe'
import {
  changerMoyenDePaiement, changerPlaces, getAbonnement, getAvantages, getContrat, getIdentite,
  getMonStatutPayant, getPaiements, getTarif, reprendre, resilier,
} from '@/api/console'
import type {
  CommerceAbonnement, CommerceAvantages, CommerceContrat, CommerceIdentiteVue, CommerceMoi,
  CommercePaiement, CommerceTarif,
} from '@/types/api.commerce'
import {
  PENDING_WINDOW_MS, VAT_SCHEME_LABEL, contratEnCours, dernierPaiement, nextProbeDelayMs,
} from '@/lib/billingTunnel'
import { getViewUser } from '@/lib/viewOrg'
import { euros } from '@/lib/euros'
import { explain, humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me } = useMe()

const orgId = computed<number | null>(() => me.value?.active_org ?? null)

// Le mode de l'écran. La consultation (`active_org_readonly`) et le « voir en tant que »
// passent en premier : le commerce y refuserait tout, rôle affiché compris.
const mode = computed<'consultation' | 'admin' | 'member'>(() => {
  if (getViewUser() || !canWriteInOrg(me.value)) return 'consultation'
  return me.value?.org_role === 'org_admin' ? 'admin' : 'member'
})

// ── l'état lu ────────────────────────────────────────────────────────────────

const abonnement = ref<CommerceAbonnement | null>(null)
const avantages = ref<CommerceAvantages | null>(null)
const contrat = ref<CommerceContrat | null>(null)
const payments = ref<CommercePaiement[]>([])
const tarif = ref<CommerceTarif | null>(null)
const moi = ref<CommerceMoi | null>(null)
// La fiche d'identité d'un abonné (#128) : l'alerte « complétez l'identité » doit mener
// quelque part une fois le tunnel disparu.
const identity = ref<CommerceIdentiteVue | null>(null)
const identityError = ref<string | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
// Le refus d'un GESTE, tel que le serveur l'a écrit. Inline et non en toast : il dit
// par où passer, il doit rester lisible.
const gestureError = ref<string | null>(null)
// Nombre de membres choisi = on est dans le tunnel. Retour à l'offre en le remettant à null.
const chosen = ref<number | null>(null)

const STATUS_TONE: Record<string, 'olive' | 'saffron' | 'terra' | 'ink'> = {
  active: 'olive', past_due: 'terra', incomplete: 'saffron', canceled: 'ink',
}
const STATUS_LABEL = computed<Record<string, string>>(() => ({
  active: t('billingUi.view.status.active'), past_due: t('billingUi.view.status.past_due'),
  incomplete: t('billingUi.view.status.incomplete'), canceled: t('billingUi.view.status.canceled'),
}))

/** Un abonnement qui court : les gestes de l'abonné ont un objet. */
const live = computed(() =>
  abonnement.value?.statut === 'active' || abonnement.value?.statut === 'past_due')

// Le dernier paiement de souscription, pour une org `incomplete` : en vol ou reçu, on
// ATTEND ; échoué (ou jamais créé), rien n'est en vol et l'offre se rouvre.
const subscribePayment = computed(() => dernierPaiement(payments.value, 'initial'))
const pending = computed<'en_vol' | 'paye' | null>(() => {
  if (abonnement.value?.statut !== 'incomplete') return null
  const p = subscribePayment.value
  return p === 'en_vol' || p === 'paye' ? p : null
})
/** Un contrat qui court : l'org a payé hors plateforme, l'offre n'a pas d'objet. */
const underContract = computed(() => contratEnCours(contrat.value))
const showOffer = computed(() => !live.value && !pending.value && !underContract.value)
const lastFailed = computed(() =>
  abonnement.value?.statut === 'incomplete' && subscribePayment.value === 'echec')
// Un changement de moyen de paiement est en validation chez le PSP : on le dit, et on
// n'en arme pas un second.
const methodInFlight = computed(() => dernierPaiement(payments.value, 'method_change') === 'en_vol')

const hasGifts = computed(() => !!avantages.value?.essai || !!avantages.value?.dons.length)

// ── lecture ──────────────────────────────────────────────────────────────────

async function loadAdmin(id: number) {
  const [ab, ct, av, pay] = await Promise.all([
    getAbonnement(id), getContrat(id), getAvantages(id), getPaiements(id)])
  abonnement.value = ab
  contrat.value = ct
  avantages.value = av
  payments.value = pay.paiements
  if (showOffer.value) tarif.value = await getTarif()
}

async function load() {
  const id = orgId.value
  loading.value = true
  error.value = null
  gestureError.value = null
  try {
    if (id == null || mode.value === 'consultation') return
    if (mode.value === 'member') moi.value = await getMonStatutPayant(id)
    else await loadAdmin(id)
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loading.value = false
  }
  if (id != null && mode.value === 'admin' && live.value) await loadIdentity()
  armPending()
}

// Relire l'état SANS `load()` : son squelette démonterait ce qui est sous les doigts.
async function refreshState() {
  const id = orgId.value
  if (id == null) return
  try {
    const [ab, pay] = await Promise.all([getAbonnement(id), getPaiements(id)])
    abonnement.value = ab
    payments.value = pay.paiements
    if (showOffer.value && !tarif.value) tarif.value = await getTarif()
  } catch (e) {
    gestureError.value = explain(e)
  }
}

// Lecture À PART, et tolérante : l'identité complète l'écran, elle n'en est pas la
// condition. Si elle échoue, l'état d'abonnement et son alerte restent affichés.
async function loadIdentity() {
  const id = orgId.value
  if (id == null) return
  identityError.value = null
  try {
    identity.value = await getIdentite(id)
  } catch (e) {
    identity.value = null
    identityError.value = humanize(e)
  }
}

// La fiche décide du régime de TVA, donc du TTC de la prochaine échéance et de
// `tva_bloquee` : l'état d'abonnement se RELIT après l'enregistrement, sinon l'alerte
// resterait affichée alors qu'elle vient d'être traitée.
async function onIdentitySaved(vue: CommerceIdentiteVue) {
  identity.value = vue
  await refreshState()
  if (!gestureError.value) toast(t('billingUi.view.identitySaved'))
}

// Le lien de l'alerte mène au formulaire. Le défilement seul ne déplace pas le focus :
// au clavier, il désignerait un endroit qu'on ne peut pas atteindre.
function goToIdentity() {
  const card = document.getElementById('billing-identity')
  if (!card) return
  card.scrollIntoView({ behavior: 'smooth', block: 'start' })
  card.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
}

// ── l'attente d'ouverture ────────────────────────────────────────────────────

const givenUp = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let deadline = 0

// Relit l'abonnement jusqu'à ce qu'il quitte `incomplete` : le webhook fait foi, l'écran
// constate. Passé la fenêtre, on cesse SANS rien annoncer de négatif.
function armPending() {
  clearTimeout(timer)
  if (!pending.value) return
  if (!deadline) deadline = Date.now() + PENDING_WINDOW_MS
  givenUp.value = false
  timer = setTimeout(probe, nextProbeDelayMs(null))
}

async function probe() {
  await refreshState()
  if (pending.value) {
    if (Date.now() >= deadline) { givenUp.value = true; return }
    timer = setTimeout(probe, nextProbeDelayMs(null))
    return
  }
  deadline = 0
  if (abonnement.value?.statut === 'active') toast(t('billingUi.view.activated'))
  await load()
}

function recheck() {
  deadline = Date.now() + PENDING_WINDOW_MS
  void probe()
}

onMounted(load)
// Changer d'org active = un autre abonnement.
watch(orgId, () => { chosen.value = null; deadline = 0; void load() })
onBeforeUnmount(() => clearTimeout(timer))

// ── l'abonné ─────────────────────────────────────────────────────────────────

// Le montant de la prochaine échéance : le TTC quand il est calculable, sinon le HT dit
// comme tel — jamais un TTC deviné.
const charge = computed(() => {
  const a = abonnement.value
  if (!a) return null
  return a.montant_ttc != null
    ? { value: euros(a.montant_ttc), sub: t('billingUi.view.perMonthTtc') }
    : { value: euros(a.montant_ht), sub: t('billingUi.view.perMonthHt') }
})

// Prochaine échéance affichée seulement quand elle a du sens (actif, non résilié).
const showNextBilling = computed(() => {
  const a = abonnement.value
  return !!(a && a.statut === 'active' && !a.resilie_le && a.echeance)
})

type Fix = 'identity' | 'resume' | 'method'
const alert = computed<{ tone: 'warn' | 'info'; text: string; fix: Fix } | null>(() => {
  const a = abonnement.value
  if (!a || !live.value) return null
  if (a.resilie_le) {
    return { tone: 'warn', fix: 'resume',
      text: `${t('billingUi.view.canceledAlert', { date: fmtDate(a.droits_jusqu_au ?? a.periode_fin) ?? '' })}.` }
  }
  if (a.statut === 'past_due') {
    return { tone: 'warn', fix: 'method',
      text: `${t('billingUi.view.pastDueAlert', { date: fmtDate(a.grace_fin) ?? '' })}.` }
  }
  // Un abonnement actif dont le TTC n'est pas calculable = une échéance que le PSP ne
  // pourra pas prélever. Le dire avant qu'elle tombe — et OUVRIR le formulaire qui la
  // débloque : une alerte sans issue a laissé le seul abonné payant bloqué huit jours.
  if (a.tva_bloquee) {
    const cause = a.tva_bloquee === 'vat_consumer_unsupported'
      ? t('billingUi.view.vatRequired')
      : t('billingUi.view.identityIncomplete')
    return { tone: 'warn', fix: 'identity', text: `${t('billingUi.view.vatBlocked', { cause })}.` }
  }
  return null
})

// ── les gestes de l'abonné ───────────────────────────────────────────────────

// Un geste qui réussit relit l'état : le commerce rend `{ok}`, pas l'abonnement.
async function gesture(run: (id: number) => Promise<unknown>, done: string): Promise<boolean> {
  const id = orgId.value
  if (id == null) return false
  busy.value = true
  gestureError.value = null
  try {
    await run(id)
    await refreshState()
    toast(done)
    return true
  } catch (e) {
    gestureError.value = explain(e)
    return false
  } finally {
    busy.value = false
  }
}

async function resiliate() {
  if (!await confirmAction({
    title: t('billingUi.view.resiliateTitle'), danger: true, confirmLabel: t('billingUi.view.resiliate'),
    message: t('billingUi.view.resiliateMessage'),
  })) return
  await gesture(resilier, t('billingUi.view.resiliated'))
}

// L'inverse de la résiliation (#845 ②). Rien n'est encaissé : l'abonnement reprend son
// cycle. Sans dialogue — le geste se défait d'un clic, comme il s'est fait.
async function resume() {
  await gesture(reprendre, t('billingUi.view.resumed'))
}

// Le nombre de membres payants (tarif par membre seulement : un forfait n'en a pas).
const editingSeats = ref(false)
const seatsDraft = ref(1)
function editSeats() {
  seatsDraft.value = abonnement.value?.places_a_l_echeance ?? abonnement.value?.places ?? 1
  gestureError.value = null
  editingSeats.value = true
}
async function saveSeats() {
  const places = seatsDraft.value
  if (await gesture((id) => changerPlaces(id, places), t('billingUi.view.seatsSaved'))) {
    editingSeats.value = false
  }
}

// Changer de carte (#845 ①) : le commerce ouvre un premier paiement à 0,00 chez le PSP
// et rend la page où le conclure. ⚠️ La phrase s'affiche AVANT la redirection : l'ancien
// moyen reste actif tant que le nouveau n'est pas confirmé — sans elle, qui abandonne
// croit s'être coupé. Le constat se fait par le webhook ; le journal le montre.
async function changeMethod() {
  const id = orgId.value
  if (id == null) return
  if (!await confirmAction({
    title: t('billingUi.view.changeCard'), message: t('billingUi.view.methodNotice'),
    confirmLabel: t('billingUi.view.toPayment'),
  })) return
  busy.value = true
  gestureError.value = null
  try {
    const started = await changerMoyenDePaiement(id)
    window.location.href = started.checkout_url
  } catch (e) {
    gestureError.value = explain(e)
  } finally {
    busy.value = false
  }
}

function backFromCheckout() {
  chosen.value = null
  void load()
}
</script>

<template>
  <!-- Tunnel du nombre de membres choisi (identité → montant → conditions → paiement). -->
  <BillingCheckout v-if="chosen != null && orgId != null && tarif" :org-id="orgId" :places="chosen"
    :tarif="tarif" @back="backFromCheckout" />

  <div v-else class="content-inner fadein">
    <!-- ── Consultation : le commerce ne lit que pour les membres de l'org ── -->
    <ConsoleCard v-if="mode === 'consultation'" :title="t('billingUi.view.subscription')">
      <Notice tone="info">
        {{ t('billingUi.view.consultation') }}
        <RouterLink v-if="orgId != null && isPlatformOperator(me)" :to="`/platform/orgs/${orgId}`"
          class="notice-fix">{{ t('billingUi.view.openOrgSheet') }}</RouterLink>
      </Notice>
    </ConsoleCard>

    <SkeletonOverview v-else-if="loading" />
    <StateError v-else-if="error" :message="error" @retry="load" />

    <!-- ── Un membre : payant ou non, et jusqu'à quand ── -->
    <ConsoleCard v-else-if="mode === 'member' && moi" :title="t('billingUi.view.memberTitle')">
      <p class="line">
        {{ moi.payant
          ? t('billingUi.view.memberPaying', { date: fmtDate(moi.jusqu_au) ?? '' })
          : t('billingUi.view.memberNotPaying') }}
      </p>
      <p class="hint">{{ t('billingUi.view.memberAdminOnly') }}</p>
    </ConsoleCard>

    <template v-else-if="mode === 'admin'">
      <!-- ── Attente d'ouverture : elle remplace l'offre, aucun « payer » atteignable. ── -->
      <BillingPending v-if="pending" :status="pending" :given-up="givenUp" @recheck="recheck" />

      <!-- ── Ce qui est offert ──
           AU-DESSUS de l'offre, et l'offre RESTE affichée dessous : un don n'est pas un
           abonnement, et la voie pour en prendre un ne doit pas se refermer. -->
      <BillingGranted v-if="hasGifts && avantages" :avantages="avantages" :offer-below="showOffer" />

      <!-- ── Sous contrat : il prend la place de l'offre tant qu'il court. ── -->
      <BillingContract v-if="underContract && contrat" :contrat="contrat" />

      <!-- ── Abonné : état courant ── -->
      <ConsoleCard v-if="live && abonnement" :title="t('billingUi.view.subscription')"
        :sub="t('billingUi.view.subscriptionOf', { org: me?.active_org_name ?? '' })">
        <template #actions>
          <Tag :tone="STATUS_TONE[abonnement.statut] ?? 'ink'">
            {{ STATUS_LABEL[abonnement.statut] ?? abonnement.statut }}</Tag>
        </template>

        <div class="grid3">
          <Stat :label="t('billingUi.view.amount')" :value="charge?.value ?? '—'" :sub="charge?.sub" />
          <Stat :label="t('billingUi.view.seats')"
            :value="abonnement.tarif === 'forfait' ? t('billingUi.view.forfait') : String(abonnement.places)" />
          <Stat v-if="showNextBilling" :label="t('billingUi.view.nextCharge')"
            :value="fmtDate(abonnement.echeance) ?? '—'" />
        </div>

        <p v-if="abonnement.regime_tva && abonnement.montant_ttc != null" class="hint">
          {{ VAT_SCHEME_LABEL[abonnement.regime_tva] }} —
          {{ t('billingUi.view.exclTax', { amount: euros(abonnement.montant_ht) }) }}
        </p>
        <p v-if="abonnement.tarif === 'forfait'" class="hint">{{ t('billingUi.view.forfaitHint') }}</p>

        <Notice v-if="abonnement.places_a_l_echeance != null" tone="info" class="mt">
          {{ t('billingUi.view.seatsDown', { n: abonnement.places_a_l_echeance,
            date: fmtDate(abonnement.periode_fin) ?? '' }, abonnement.places_a_l_echeance) }}
        </Notice>

        <Notice v-if="alert" :tone="alert.tone" class="mt">
          {{ alert.text }}
          <Btn v-if="alert.fix === 'identity'" kind="link" icon="chev" class="notice-fix"
            @click="goToIdentity">{{ t('billingUi.view.completeIdentity') }}</Btn>
          <Btn v-else-if="alert.fix === 'resume'" kind="link" icon="chev" class="notice-fix"
            :disabled="busy" @click="resume">{{ t('billingUi.view.undoCancel') }}</Btn>
          <Btn v-else-if="alert.fix === 'method' && !methodInFlight" kind="link" icon="card" class="notice-fix"
            :disabled="busy" @click="changeMethod">{{ t('billingUi.view.changeCard') }}</Btn>
        </Notice>

        <Notice v-if="methodInFlight" tone="info" class="mt">{{ t('billingUi.view.methodInFlight') }}</Notice>

        <!-- Le refus d'un geste, tel que le serveur l'a écrit ; relire l'état est le geste
             qui suit. -->
        <Notice v-if="gestureError" tone="warn" class="mt">
          {{ gestureError }}
          <Btn kind="link" icon="chev" class="notice-fix" @click="load">{{ t('billingUi.view.refresh') }}</Btn>
        </Notice>

        <!-- Le nombre de membres payants : une hausse vaut tout de suite, une baisse à l'échéance. -->
        <div v-if="editingSeats" class="seats-edit">
          <label class="seats-field">
            <span class="seats-label">{{ t('billingUi.view.seatsLabel') }}</span>
            <input v-model.number="seatsDraft" class="inp seats-input" type="number" min="1" step="1"
              :disabled="busy" />
          </label>
          <p class="hint">{{ t('billingUi.view.seatsRule') }}</p>
          <div class="row-actions">
            <Btn icon="check" :disabled="busy || !Number.isInteger(seatsDraft) || seatsDraft < 1"
              @click="saveSeats">{{ t('billingUi.view.seatsSave') }}</Btn>
            <Btn kind="ghost" :disabled="busy" @click="editingSeats = false">{{ t('billingUi.view.seatsCancel') }}</Btn>
          </div>
        </div>

        <div v-else class="row-actions">
          <Btn v-if="abonnement.tarif === 'par_membre'" kind="ghost" icon="pen" :disabled="busy"
            @click="editSeats">{{ t('billingUi.view.changeSeats') }}</Btn>
          <!-- En impayé, c'est l'alerte qui porte « Changer de carte ». -->
          <Btn v-if="abonnement.statut !== 'past_due' && !methodInFlight" kind="ghost" icon="card"
            :disabled="busy" @click="changeMethod">{{ t('billingUi.view.changeCard') }}</Btn>
          <Btn v-if="!abonnement.resilie_le" kind="danger" icon="trash" :disabled="busy"
            @click="resiliate">{{ t('billingUi.view.cancelSub') }}</Btn>
        </div>
      </ConsoleCard>

      <!-- ── Pas d'abonnement qui court : l'offre ── -->
      <BillingSeats v-else-if="showOffer && tarif" :tarif="tarif" :last-failed="lastFailed"
        @choose="chosen = $event" />

      <!-- ── Identité de facturation ──
           Le MÊME formulaire que le tunnel, monté ici pour un abonné : c'est après la
           souscription qu'une adresse change, qu'un numéro de TVA arrive, et que l'échéance
           suivante en dépend. Un seul composant, une seule règle de saisie. -->
      <ConsoleCard v-if="live && orgId != null" id="billing-identity" :title="t('billingUi.view.identityTitle')"
        :sub="t('billingUi.view.identitySub')">
        <Notice v-if="identityError" tone="warn">
          {{ identityError }}
          <Btn kind="link" icon="chev" class="notice-fix" @click="loadIdentity">{{ t('common.retry') }}</Btn>
        </Notice>
        <BillingIdentityForm v-else :org-id="orgId" :view="identity" :can-manage="true"
          @saved="onIdentitySaved" />
      </ConsoleCard>

      <!-- ── Factures ── AU-DESSUS du journal : la facture est le document que les CGV
           promettent téléchargeable. Sans condition d'abonnement — « reste
           téléchargeable » vaut après résiliation. -->
      <BillingInvoices v-if="orgId != null" :key="orgId" :org-id="orgId" :paying="live" />

      <!-- ── Historique des paiements ── -->
      <BillingPaymentsCard v-if="payments.length" :payments="payments" />
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
.line { margin: 0; font-size: var(--fs-small); color: var(--color-ink); line-height: 1.6; }
.seats-edit { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.seats-edit .hint { margin: 0; }
.seats-edit .row-actions { margin-top: 4px; }
.seats-field { display: flex; flex-direction: column; gap: 5px; }
.seats-label {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint);
}
.seats-input { width: 120px; }
</style>
