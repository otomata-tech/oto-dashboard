<script setup lang="ts">
// Abonnement de l'ORG active (ADR 0043) — PSP Stancer. Scopé à l'org consultée
// (X-Oto-Org injecté par api()). Souscrire/résilier = org_admin ; consulter = tout
// membre. Pas de webhooks Stancer → au retour de la page hébergée on POLLE (confirm).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import Icon from '@/components/console/Icon.vue'
import StateError from '@/components/console/StateError.vue'
import SkeletonOverview from '@/components/console/SkeletonOverview.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import {
  getBilling, getBillingPayments, subscribeBilling, confirmBilling, cancelBilling,
} from '@/api/console'
import type { BillingStatus, BillingPlan, BillingPayment, BillingSubscribeResult } from '@/types/api'
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
  if (['captured', 'to_capture', 'authorized', 'capture_sent'].includes(s)) return 'olive'
  if (['refused', 'failed', 'expired', 'unpaid'].includes(s)) return 'terra'
  return 'ink'
}

// Bandeau d'alerte de l'état abonné (résiliation programmée / impayé / mandat non signé).
const alert = computed<{ tone: 'warn' | 'info'; icon: string; text: string } | null>(() => {
  const s = status.value
  if (!s?.subscribed) return null
  if (s.canceled_at) {
    return { tone: 'warn', icon: 'warn', text: `Résiliation programmée — l'accès reste ouvert `
      + `jusqu'au ${fmtDate(s.current_period_end)}, puis passage au niveau gratuit.` }
  }
  if (s.status === 'past_due') {
    return { tone: 'warn', icon: 'warn', text: `Paiement en échec — un nouvel essai est en cours, `
      + `l'accès est maintenu jusqu'au ${fmtDate(s.grace_until)}.` }
  }
  if (s.status === 'incomplete') {
    return { tone: 'info', icon: 'info', text: `Le mandat de prélèvement n'est pas encore signé.` }
  }
  return null
})

// Prochaine échéance affichée seulement quand elle a du sens (abonnement actif non résilié).
const showNextBilling = computed(() => {
  const s = status.value
  return !!(s && !s.comp && s.status === 'active' && !s.canceled_at && s.next_billing_at)
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
      <ConsoleCard v-if="status.subscribed" :title="status.label ?? 'Abonnement'"
        :sub="`abonnement de « ${me?.active_org_name ?? '' } »`">
        <template #actions>
          <Tag v-if="status.comp" tone="cobalt">offert par Otomata</Tag>
          <Tag v-else-if="status.status" :tone="STATUS_TONE[status.status] ?? 'ink'">
            {{ STATUS_LABEL[status.status] ?? status.status }}</Tag>
        </template>

        <div class="grid3">
          <Stat label="montant"
            :value="euros(status.amount)" :sub="status.amount ? 'par mois' : undefined" />
          <Stat v-if="showNextBilling" label="prochaine échéance"
            :value="fmtDate(status.next_billing_at) ?? '—'" />
          <Stat label="paiement" :value="methodLabel(status.method)" />
        </div>

        <div v-if="alert" class="notice" :class="alert.tone">
          <Icon :name="alert.icon" :size="15" />
          <span>{{ alert.text }}</span>
        </div>

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
        :sub="canManage ? 'un abonnement par organisation, sans engagement — carte bancaire ou prélèvement SEPA.'
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
                <Btn icon="card" :disabled="busy"
                  @click="subscribeCard(p.plan)">Carte bancaire</Btn>
                <Btn kind="ghost" :disabled="busy"
                  @click="subscribeSepa(p.plan)">Prélèvement SEPA</Btn>
              </template>
            </div>
          </div>
        </div>

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

.notice {
  display: flex; align-items: flex-start; gap: 9px; margin-top: 14px; padding: 10px 12px;
  border-radius: var(--radius-md); font-size: var(--fs-small); line-height: 1.5;
}
.notice.warn { background: var(--color-terra-soft); color: var(--color-terra-ink); }
.notice.warn :deep(svg) { color: var(--color-terra-ink); flex: none; margin-top: 1px; }
.notice.info { background: var(--color-hair-soft); color: var(--color-ink-soft); }
.notice.info :deep(svg) { color: var(--color-mute); flex: none; margin-top: 1px; }

.row-actions { margin-top: 16px; }
.hint { font-size: 12px; color: var(--color-mute); margin: 14px 0 0; line-height: 1.5; }
</style>
