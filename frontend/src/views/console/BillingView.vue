<script setup lang="ts">
// Abonnement de l'ORG active (ADR 0043) — PSP Mollie. Scopé à l'org consultée
// (X-Oto-Org injecté par api()). Souscrire/résilier = org_admin ; consulter = tout
// membre. v1 = carte (« v1 CB seule ») : le paiement + le moyen de paiement
// récurrent se font sur la page de checkout hébergée Mollie.
//
// Cette vue porte le catalogue, l'état d'abonnement et le RETOUR du paiement ; le
// tunnel (identité → montant → consentement → paiement) vit dans
// `components/console/billing/`.
//
// ⚠️ **Au retour, un paiement réussi ne produit jamais d'échec.** Toutes les branches
// d'avancement de `confirm` sont des 200 discriminées par `status`, et
// `pending_mandate` veut dire « encaissé, le moyen de paiement réutilisable n'existe
// pas encore chez le PSP » : on sonde, on n'annonce rien de négatif, et on ne
// repropose surtout pas de payer. C'est ce bouton reproposé qui a débité deux fois
// le premier client payant le 25/08/2026 (#127).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import Notice from '@/components/console/Notice.vue'
import Icon from '@/components/console/Icon.vue'
import StateError from '@/components/console/StateError.vue'
import SkeletonOverview from '@/components/console/SkeletonOverview.vue'
import BillingCheckout from '@/components/console/billing/BillingCheckout.vue'
import BillingPending from '@/components/console/billing/BillingPending.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe, isSuperAdmin } from '@/composables/useMe'
import {
  getBilling, getBillingPayments, confirmBilling, cancelBilling,
} from '@/api/console'
import type { BillingStatus, BillingPlan, BillingPayment, VatScheme } from '@/types/api'
import { PENDING_WINDOW_MS, VAT_SCHEME_LABEL, nextProbeDelayMs } from '@/lib/billingTunnel'
import { explain, humanize } from '@/lib/errors'
import { fmtDate, fmtDateTime } from '@/types/api'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me } = useMe()

const status = ref<BillingStatus | null>(null)
const payments = ref<BillingPayment[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
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

function euros(cents: number | null | undefined): string {
  if (cents == null) return 'sur devis'
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0 })
}

// Le seul axe qui varie réellement entre paliers (backend : options + unmetered
// identiques partout — cf. billing.py PLANS). Le reste = « inclus dans tous les plans ».
function accountsLabel(p: BillingPlan): string {
  if (p.unipile_accounts == null) return 'Comptes messagerie illimités'
  if (p.unipile_accounts === 1) return '1 compte messagerie connecté'
  return `${p.unipile_accounts} comptes messagerie connectés`
}

function methodLabel(m: string | null | undefined): string {
  if (m === 'comp') return 'Offert'
  if (m === 'sepa') return 'Prélèvement SEPA'
  return 'Carte bancaire'
}

function payKind(kind: string): string {
  if (kind === 'initial') return 'Souscription'
  if (kind === 'renewal') return 'Échéance'
  if (kind === 'method_change') return 'Changement de moyen'
  return kind
}
function payTone(s: string): 'olive' | 'terra' | 'ink' {
  // statuts Mollie : paid = encaissé ; pending/open/authorized = en cours ;
  // failed/canceled/expired = échec.
  if (['paid', 'authorized'].includes(s)) return 'olive'
  if (['failed', 'canceled', 'expired'].includes(s)) return 'terra'
  return 'ink'
}

// Bandeau d'alerte de l'état abonné (résiliation programmée / impayé / échéance que
// le prélèvement ne pourra pas honorer).
const alert = computed<{ tone: 'warn' | 'info'; text: string } | null>(() => {
  const s = status.value
  if (!s?.subscribed) return null
  if (s.canceled_at) {
    return { tone: 'warn', text: `Résiliation programmée — l'accès reste ouvert `
      + `jusqu'au ${fmtDate(s.current_period_end)}, puis passage au niveau gratuit.` }
  }
  if (s.status === 'past_due') {
    return { tone: 'warn', text: `Paiement en échec — un nouvel essai est en cours, `
      + `l'accès est maintenu jusqu'au ${fmtDate(s.grace_until)}.` }
  }
  // Un abonnement actif dont le TTC n'est pas calculable = une échéance que le
  // serveur ne pourra pas prélever. Le dire avant qu'elle tombe.
  if (s.vat_blocked) {
    return { tone: 'warn', text: 'La prochaine échéance ne peut pas être calculée : '
      + 'complétez l\'identité de facturation de l\'organisation.' }
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

onMounted(async () => {
  const url = new URL(window.location.href)
  if (url.searchParams.get('billing') === 'return') {
    // `payment_ref` est posé par le serveur sur l'URL de retour : le navigateur DIT
    // quel paiement il vient de conclure, au lieu de laisser le serveur prendre « le
    // plus récent ». Les deux paramètres sont nettoyés de la barre d'adresse.
    const paymentRef = url.searchParams.get('payment_ref')
    url.searchParams.delete('billing')
    url.searchParams.delete('payment_ref')
    window.history.replaceState({}, '', url.toString())
    deadline = Date.now() + PENDING_WINDOW_MS
    loading.value = false
    await probe(paymentRef)
    if (pending.value) return   // l'attente s'affiche seule, `load` viendra à la fin
  }
  await load()
})

onBeforeUnmount(() => clearTimeout(timer))

// ── résiliation ──────────────────────────────────────────────────────────────

const returnUrl = `${window.location.origin}/org/billing?billing=return`

async function resiliate() {
  if (!await confirmAction({
    title: 'Résilier l\'abonnement', danger: true, confirmLabel: 'Résilier',
    message: 'l\'accès reste ouvert jusqu\'à la fin de la période en cours, '
      + 'puis repasse au niveau gratuit. rien n\'est supprimé.',
  })) return
  busy.value = true
  try {
    status.value = await cancelBilling()
    toast('résiliation enregistrée')
  } catch (e) {
    toast(explain(e))
  } finally {
    busy.value = false
  }
}

function contactSales() {
  window.location.href = 'mailto:contact@otomata.tech?subject=Abonnement%20Entreprise'
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

        <Notice v-if="alert" :tone="alert.tone" class="mt">{{ alert.text }}</Notice>

        <div v-if="canManage && !status.comp && status.status !== 'canceled'" class="row-actions">
          <Btn kind="danger" icon="trash" :disabled="busy" @click="resiliate">
            Résilier l'abonnement</Btn>
        </div>
        <p v-else-if="status.comp" class="hint">
          Cet abonnement est offert par Otomata — aucun paiement, aucune échéance.
        </p>
      </ConsoleCard>

      <!-- ── Pas abonné : catalogue des plans ── -->
      <ConsoleCard v-else title="Choisir un abonnement"
        :sub="canManage ? 'un abonnement par organisation, sans engagement — paiement par carte bancaire.'
          : 'seul un administrateur de l\'organisation peut souscrire.'">
        <div class="grid3">
          <div v-for="p in status.plans" :key="p.plan" class="plan" :class="{ custom: p.custom }">
            <div class="plan-head">
              <span class="plan-name">{{ p.label }}</span>
              <Tag v-if="p.custom" tone="cobalt">sur devis</Tag>
            </div>
            <div class="plan-price">
              <span class="amt">{{ euros(p.amount) }}</span>
              <span v-if="p.amount != null" class="per">/ mois</span>
            </div>
            <div class="plan-accounts">{{ accountsLabel(p) }}</div>
            <div class="plan-cta">
              <Btn v-if="p.custom" kind="ghost" icon="ext" @click="contactSales">
                Nous contacter</Btn>
              <template v-else-if="canManage">
                <!-- « Choisir » et non « S'abonner » : le clic ouvre le tunnel, il
                     n'engage aucun paiement. -->
                <Btn icon="card" @click="chosen = p">Choisir</Btn>
              </template>
            </div>
          </div>
        </div>

        <p class="hint">Les prix sont hors taxes ; la TVA applicable est calculée à
          l'étape suivante, à partir de votre pays de facturation.</p>

        <div class="incl">
          <div class="incl-h">Inclus dans tous les plans</div>
          <ul class="incl-list">
            <li><Icon name="ok" :size="15" /> Messagerie LinkedIn &amp; WhatsApp (Unipile)</li>
            <li><Icon name="ok" :size="15" /> Connecteurs de données sans quota d'appel</li>
            <li><Icon name="ok" :size="15" /> Données entreprises France, CRM, e-mail &amp; base de connaissance</li>
          </ul>
        </div>
      </ConsoleCard>

      <!-- ── Historique des paiements ── -->
      <ConsoleCard v-if="status.subscribed && payments.length" flush title="Paiements"
        sub="les échéances de cet abonnement.">
        <table class="tbl">
          <thead>
            <tr><th>Date</th><th>Type</th><th class="num">Montant</th><th>Statut</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in payments" :key="p.id">
              <td class="mono">{{ fmtDateTime(p.created_at) }}</td>
              <td>{{ payKind(p.kind) }}</td>
              <td class="num">{{ euros(p.amount) }}</td>
              <td><Tag :tone="payTone(p.status)">{{ p.status }}</Tag></td>
            </tr>
          </tbody>
        </table>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
/* Carte d'un palier — composée sur les tokens carte (filet doux + ombre, jamais de bord noir). */
.plan {
  display: flex; flex-direction: column; gap: 12px; padding: 16px;
  border: 1px solid var(--color-card-bd); border-radius: var(--radius-md);
  background: var(--color-surface); box-shadow: var(--shadow-card);
}
.plan.custom { border-style: dashed; box-shadow: none; }
.plan-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.plan-name { font-weight: 700; font-size: 14px; color: var(--color-ink); }
.plan-price { display: flex; align-items: baseline; gap: 4px; }
.plan-price .amt {
  font-size: 26px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1;
  color: var(--color-ink);
}
.plan-price .per { font-size: 12px; color: var(--color-mute); }
.plan-accounts { font-size: var(--fs-small); color: var(--color-ink-soft); }
.plan-cta { display: flex; flex-direction: column; gap: 7px; margin-top: auto; }

/* Bande « inclus partout » — la vérité commune aux paliers, dite une seule fois. */
.incl { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--color-hair-soft); }
.incl-h {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint); margin-bottom: 8px;
}
.incl-list { display: flex; flex-direction: column; gap: 6px; }
.incl-list li {
  display: flex; align-items: center; gap: 8px; font-size: var(--fs-small);
  color: var(--color-ink-soft);
}
.incl-list li :deep(svg) { color: var(--color-olive-ink); flex: none; }

.mt { margin-top: 14px; }
.row-actions { margin-top: 16px; }
.hint { font-size: 12px; color: var(--color-mute); margin: 14px 0 0; line-height: 1.5; }
</style>
