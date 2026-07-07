<script setup lang="ts">
// Abonnement de l'ORG active (ADR 0043) — PSP Stancer. Scopé à l'org consultée
// (X-Oto-Org injecté par api()). Souscrire/résilier = org_admin ; consulter = tout
// membre. Pas de webhooks Stancer → au retour de la page hébergée on POLLE (confirm).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import StateError from '@/components/console/StateError.vue'
import SkeletonOverview from '@/components/console/SkeletonOverview.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import {
  getBilling, getBillingPayments, subscribeBilling, confirmBilling, cancelBilling,
} from '@/api/console'
import type { BillingStatus, BillingPayment, BillingSubscribeResult } from '@/types/api'
import { humanize } from '@/lib/errors'
import { fmtDate, fmtDateTime } from '@/types/api'

const { toast } = useToast()
const { confirmAction, promptForm } = usePrompt()
const { me } = useMe()

const status = ref<BillingStatus | null>(null)
const payments = ref<BillingPayment[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)

// Souscrire/résilier réservé à l'org_admin (le backend le garde aussi — l'UI ne
// fait que masquer les leviers).
const canManage = computed(() =>
  me.value?.org_role === 'org_admin' || me.value?.role === 'super_admin')

const STATUS_TONE: Record<string, 'olive' | 'saffron' | 'terra' | 'ink'> = {
  active: 'olive', past_due: 'terra', incomplete: 'saffron', canceled: 'ink',
}

function euros(cents: number | null | undefined): string {
  if (cents == null) return 'sur devis'
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0 })
}

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

// Retour de la page hébergée Stancer (?billing=return) → on confirme (polling).
onMounted(async () => {
  const url = new URL(window.location.href)
  if (url.searchParams.get('billing') === 'return') {
    url.searchParams.delete('billing')
    window.history.replaceState({}, '', url.toString())
    loading.value = true
    try {
      const s = await confirmBilling()
      toast(s.status === 'active' ? 'abonnement activé'
        : s.status === 'pending' ? 'paiement en attente — on vérifie sous peu'
        : 'paiement non abouti')
    } catch (e) {
      toast(humanize(e))
    }
  }
  await load()
})

const returnUrl = `${window.location.origin}/org/billing?billing=return`

async function subscribeCard(plan: string) {
  await go(() => subscribeBilling({ plan, return_url: returnUrl, method: 'card' }))
}

async function subscribeSepa(plan: string) {
  const f = await promptForm({
    title: 'Payer par prélèvement SEPA',
    description: 'On génère un mandat ; le titulaire signe sur une page sécurisée '
      + '(un code de confirmation lui est envoyé par SMS).',
    submitLabel: 'Créer le mandat',
    fields: [
      { key: 'iban', label: 'IBAN', placeholder: 'FR76 …', required: true },
      { key: 'holder_name', label: 'Titulaire du compte', required: true },
      { key: 'mobile', label: 'Mobile du signataire', placeholder: '+33 6 …',
        required: true, hint: 'reçoit le code de signature du mandat' },
    ],
  })
  if (!f) return
  await go(() => subscribeBilling({ plan, return_url: returnUrl, method: 'sepa',
    iban: f.iban, holder_name: f.holder_name, mobile: f.mobile }))
}

// Ouvre la page hébergée Stancer (paiement OU signature) dans le même onglet.
async function go(call: () => Promise<BillingSubscribeResult | BillingStatus>) {
  busy.value = true
  try {
    const r = await call()
    if ('checkout_url' in r && r.checkout_url) {
      window.location.href = r.checkout_url
    } else {
      await load()
    }
  } catch (e) {
    toast(humanize(e))
  } finally {
    busy.value = false
  }
}

function contactSales() {
  window.location.href = 'mailto:contact@otomata.tech?subject=Abonnement%20Entreprise'
}

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
    toast(humanize(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="content-inner fadein">
    <SkeletonOverview v-if="loading" />
    <StateError v-else-if="error" :message="error" @retry="load" />

    <template v-else-if="status">
      <!-- ── Abonné : état courant ── -->
      <ConsoleCard v-if="status.subscribed" title="abonnement"
        :sub="`plan de l'organisation « ${me?.active_org_name ?? ''} »`">
        <template #actions>
          <Tag :tone="STATUS_TONE[status.status ?? 'ink']">{{ status.status }}</Tag>
        </template>

        <div class="sub-head">
          <div>
            <div class="sub-plan">{{ status.label }}</div>
            <div class="sub-price">{{ euros(status.amount) }}<span v-if="status.amount"> / mois</span></div>
          </div>
          <Tag v-if="status.comp" tone="cobalt">offert (admin)</Tag>
          <Tag v-else tone="ink">{{ status.method === 'sepa' ? 'prélèvement SEPA' : 'carte bancaire' }}</Tag>
        </div>

        <div class="sub-rows">
          <div v-if="status.canceled_at" class="sub-row warn">
            <span class="k">résiliation</span>
            <span class="v">active jusqu'au {{ fmtDate(status.current_period_end) }}, puis arrêt</span>
          </div>
          <div v-else-if="status.status === 'past_due'" class="sub-row warn">
            <span class="k">impayé</span>
            <span class="v">nouvel essai en cours — accès maintenu jusqu'au {{ fmtDate(status.grace_until) }}</span>
          </div>
          <div v-else-if="status.next_billing_at" class="sub-row">
            <span class="k">prochaine échéance</span>
            <span class="v">{{ fmtDate(status.next_billing_at) }}</span>
          </div>
          <div v-if="status.status === 'incomplete'" class="sub-row warn">
            <span class="k">en attente</span>
            <span class="v">le mandat de prélèvement n'est pas encore signé</span>
          </div>
        </div>

        <div v-if="canManage && !status.comp && status.status !== 'canceled'" class="sub-actions">
          <Btn kind="danger" :disabled="busy" @click="resiliate">Résilier</Btn>
        </div>
        <p v-else-if="status.comp" class="sub-note">
          cet abonnement est offert par Otomata — aucun paiement, aucune échéance.
        </p>
      </ConsoleCard>

      <!-- ── Pas abonné : catalogue des plans ── -->
      <ConsoleCard v-else title="choisir un abonnement"
        :sub="canManage ? 'un abonnement par organisation — carte bancaire ou prélèvement SEPA.'
          : 'seul un admin de l\'organisation peut souscrire.'">
        <div class="plans">
          <div v-for="p in status.plans" :key="p.plan" class="plan"
            :class="{ custom: p.custom }">
            <div class="plan-name">{{ p.label }}</div>
            <div class="plan-price">
              <template v-if="p.amount != null">
                <span class="amt">{{ euros(p.amount) }}</span><span class="per"> / mois</span>
              </template>
              <span v-else class="amt">sur devis</span>
            </div>
            <div class="plan-feat">
              <span class="feat">messagerie LinkedIn / WhatsApp</span>
              <span class="feat">{{ p.unipile_accounts == null ? 'comptes illimités'
                : p.unipile_accounts === 1 ? '1 compte connecté'
                : `${p.unipile_accounts} comptes connectés` }}</span>
              <span class="feat">connecteurs de données sans quota</span>
            </div>
            <Btn v-if="p.custom" kind="ghost" icon="ext" @click="contactSales">
              Nous contacter
            </Btn>
            <div v-else-if="canManage" class="plan-cta">
              <Btn :disabled="busy" @click="subscribeCard(p.plan)">Carte bancaire</Btn>
              <Btn kind="ghost" :disabled="busy" @click="subscribeSepa(p.plan)">Prélèvement</Btn>
            </div>
          </div>
        </div>
      </ConsoleCard>

      <!-- ── Historique des paiements ── -->
      <ConsoleCard v-if="status.subscribed && payments.length" title="paiements"
        sub="les échéances de cet abonnement.">
        <div class="pay-rows">
          <div v-for="p in payments" :key="p.id" class="pay-row">
            <span class="pay-date">{{ fmtDateTime(p.created_at) }}</span>
            <span class="pay-kind">{{ p.kind === 'initial' ? 'souscription'
              : p.kind === 'renewal' ? 'échéance' : p.kind }}</span>
            <span class="pay-amt">{{ euros(p.amount) }}</span>
            <Tag :tone="['captured', 'to_capture', 'authorized', 'capture_sent'].includes(p.status)
              ? 'olive' : ['refused', 'failed', 'expired', 'unpaid'].includes(p.status) ? 'terra' : 'ink'">
              {{ p.status }}</Tag>
          </div>
        </div>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.sub-head {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding-bottom: 14px; border-bottom: 1px solid var(--color-hair-soft);
}
.sub-plan { font-weight: 600; font-size: 16px; color: var(--color-ink); }
.sub-price { font-size: 13px; color: var(--color-mute); margin-top: 2px; }
.sub-rows { display: flex; flex-direction: column; gap: 2px; margin-top: 12px; }
.sub-row {
  display: flex; gap: 12px; padding: 9px 2px;
  border-bottom: 1px solid var(--color-hair-soft); font-size: 13px;
}
.sub-row:last-child { border-bottom: 0; }
.sub-row .k {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--color-faint); width: 150px; flex: none;
}
.sub-row .v { color: var(--color-ink); }
.sub-row.warn .v { color: var(--color-terra-ink, var(--color-ink)); }
.sub-actions { margin-top: 16px; }
.sub-note { font-size: 12px; color: var(--color-mute); margin: 14px 0 0; line-height: 1.5; }

.plans {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;
}
.plan {
  display: flex; flex-direction: column; gap: 10px; padding: 18px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  background: var(--color-surface);
}
.plan.custom { border-style: dashed; }
.plan-name { font-weight: 600; font-size: 14px; color: var(--color-ink); }
.plan-price { display: flex; align-items: baseline; gap: 2px; }
.plan-price .amt { font-size: 22px; font-weight: 700; color: var(--color-ink); }
.plan-price .per { font-size: 12px; color: var(--color-mute); }
.plan-feat { display: flex; flex-direction: column; gap: 5px; margin: 4px 0 8px; }
.feat { font-size: 12px; color: var(--color-ink-soft); padding-left: 15px; position: relative; }
.feat::before {
  content: '·'; position: absolute; left: 4px; color: var(--color-saffron, var(--color-faint));
  font-weight: 700;
}
.plan-cta { display: flex; flex-direction: column; gap: 7px; margin-top: auto; }

.pay-rows { display: flex; flex-direction: column; }
.pay-row {
  display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 14px;
  padding: 9px 2px; border-bottom: 1px solid var(--color-hair-soft); font-size: 12.5px;
}
.pay-row:last-child { border-bottom: 0; }
.pay-date { color: var(--color-mute); font-family: var(--font-mono); font-size: 11px; }
.pay-kind { color: var(--color-ink); }
.pay-amt { color: var(--color-ink); font-weight: 500; }
</style>
