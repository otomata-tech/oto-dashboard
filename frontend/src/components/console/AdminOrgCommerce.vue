<script setup lang="ts">
// La part COMMERCE de la fiche d'une organisation (24/09/2026) : le plan / abonnement et
// l'identité de facturation (client Pennylane). Sortie d'`AdminOrgView`, qui mêlait ces
// cartes au profil et aux membres — ce que le chantier du front unique (§6) et l'ADR 0070
// veulent séparer : le cœur d'une instance ne connaît ni plan ni facture. Ici, la frontière
// est tracée dans l'écran ; elle suivra le commerce quand il sortira du cœur.
import { computed, onMounted, ref, watch } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import FormDialog from './FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { adminSetPlan, getPlans, getAdminBillingIdentity, setAdminBillingIdentity } from '@/api/console'
import type { BillingPlan, OrgDetail } from '@/types/api'
import type { AdminBillingIdentityView } from '@/types/api.attendu'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const props = defineProps<{
  orgId: number
  orgName: string
  billing: OrgDetail['billing'] | null | undefined
  canWrite: boolean
  isOperator: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

const plans = ref<BillingPlan[]>([])
async function load() {
  plans.value = (await getPlans().catch(() => ({ plans: [] as BillingPlan[] }))).plans
  await refreshBillingIdentity()
}
onMounted(load)
watch(() => props.orgId, load)

// ── plan / abonnement (ADR 0043) ─────────────────────────────────────────────
// Le plan pilote l'entitlement (options + plafond messagerie). `admin_set_plan`
// force un plan COMP (sans PSP, jamais facturé) ; on ne touche JAMAIS un
// abonnement payant depuis ici (le backend refuse admin_clear_plan dessus).
const billing = computed(() => props.billing ?? null)
const isCompPlan = computed(() => billing.value?.comp === true)
const isPaidPlan = computed(() => billing.value?.subscribed === true && billing.value?.comp === false)

function fmtAmount(p: BillingPlan): string {
  if (p.amount == null) return 'sur devis'
  return `${(p.amount / 100).toLocaleString('fr-FR')} €/${p.interval === 'year' ? 'an' : 'mois'}`
}
const currentPlanMeta = computed(() =>
  billing.value?.plan ? plans.value.find((p) => p.plan === billing.value?.plan) ?? null : null)

function forcePlan() {
  if (!plans.value.length) { toast('catalogue de plans indisponible'); return }
  openForm({
    title: 'forcer un plan (comp)',
    description: 'ouvre l\'entitlement du plan (options + plafond messagerie) immédiatement, sans paiement ni PSP. écrase l\'abonnement existant.',
    submitLabel: 'forcer le plan',
    fields: [
      { key: 'plan', label: 'plan', type: 'select', required: true,
        initial: billing.value?.plan,
        options: plans.value.map((p) => ({ value: p.plan, label: `${p.label} · ${fmtAmount(p)}` })) },
    ],
    onConfirm: async (v) => {
      try { await adminSetPlan(props.orgId, v.plan ?? ''); toast('plan forcé (comp)'); emit('changed') }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function clearPlan() {
  if (!await confirmAction({ title: 'retirer le plan comp', danger: true, confirmLabel: 'Retirer',
    message: 'retirer l\'abonnement comp de l\'org ? l\'entitlement du plan (options + plafond messagerie) tombe aussitôt.' })) return
  try { await adminSetPlan(props.orgId, null); toast('plan retiré'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}

// ── identité de facturation + client Pennylane (#917) ────────────────────────
// Le client Pennylane d'une org n'est jamais rapproché ni créé par le code : un
// admin plateforme le DÉSIGNE ici, à la main, sur la fiche de facturation. La fiche
// part ENTIÈRE (le serveur remplace, il ne fusionne pas) : le formulaire est
// prérempli et reposte tout, un id vide RETIRE la désignation. La carte n'apparaît
// qu'à un opérateur plateforme (le backend rend 403 sinon) ; « billing » désactivé
// = 404 sur la route, la carte se tait.
const billingIdentity = ref<AdminBillingIdentityView | null>(null)
const billingIdentityError = ref<string | null>(null)
async function refreshBillingIdentity() {
  if (!props.isOperator) return
  billingIdentityError.value = null
  try { billingIdentity.value = await getAdminBillingIdentity(props.orgId) }
  catch (e) { billingIdentity.value = null; billingIdentityError.value = humanize(e) }
}
const identityLines = computed(() => {
  const i = billingIdentity.value?.identity
  if (!i) return []
  return [i.address_line, i.address_line2, [i.postal_code, i.city].filter(Boolean).join(' ')]
    .filter((s): s is string => !!s && s.trim() !== '')
})
function editBillingIdentity() {
  const i = billingIdentity.value?.identity
  const current = billingIdentity.value?.pennylane_customer_id
  openForm({
    title: 'identité de facturation',
    description: 'la fiche part entière : un champ vidé est effacé. l\'id Pennylane est celui de l\'URL de la fiche client chez Pennylane — vide = aucun client désigné, donc aucune facture émise.',
    submitLabel: 'enregistrer',
    fields: [
      { key: 'legal_name', label: 'raison sociale', required: true, initial: i?.legal_name ?? props.orgName },
      { key: 'country_code', label: 'pays (ISO-2)', required: true, initial: i?.country_code ?? 'FR', placeholder: 'FR' },
      { key: 'vat_number', label: 'n° TVA intracom', initial: i?.vat_number ?? '', placeholder: 'FR12345678901' },
      { key: 'address_line', label: 'adresse', required: true, initial: i?.address_line ?? '' },
      { key: 'address_line2', label: 'complément d\'adresse', initial: i?.address_line2 ?? '' },
      { key: 'postal_code', label: 'code postal', required: true, initial: i?.postal_code ?? '' },
      { key: 'city', label: 'ville', required: true, initial: i?.city ?? '' },
      { key: 'billing_email', label: 'e-mail de facturation', initial: i?.billing_email ?? '' },
      { key: 'pennylane_customer_id', label: 'id client Pennylane', initial: current != null ? String(current) : '',
        hint: 'nombre entier, tel qu\'il apparaît dans l\'URL de la fiche client chez Pennylane.' },
    ],
    onConfirm: async (v) => {
      const raw = (v.pennylane_customer_id ?? '').trim()
      if (raw !== '' && !/^\d+$/.test(raw)) { toast('id client Pennylane : un nombre entier attendu'); throw new Error('invalid_pennylane_customer_id') }
      const blank = (s?: string) => { const t = (s ?? '').trim(); return t === '' ? null : t }
      try {
        billingIdentity.value = await setAdminBillingIdentity(props.orgId, {
          legal_name: (v.legal_name ?? '').trim(),
          country_code: (v.country_code ?? '').trim(),
          vat_number: blank(v.vat_number),
          address_line: (v.address_line ?? '').trim(),
          address_line2: blank(v.address_line2),
          postal_code: (v.postal_code ?? '').trim(),
          city: (v.city ?? '').trim(),
          billing_email: blank(v.billing_email),
          pennylane_customer_id: raw === '' ? null : Number(raw),
        })
        toast('identité de facturation enregistrée')
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}

</script>

<template>
  <div class="grid2">
        <!-- Plan / abonnement : forcer un plan comp (entitlement immédiat, sans PSP). -->
        <ConsoleCard title="plan / abonnement" sub="le plan ouvre l'entitlement (options + plafond messagerie). « comp » = forcé par un admin, jamais facturé.">
          <template v-if="canWrite" #actions>
            <Btn kind="mini" icon="pen" @click="forcePlan">{{ billing?.subscribed ? 'changer' : 'forcer un plan' }}</Btn>
          </template>
          <div class="rowlist">
            <div v-if="billing?.subscribed" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 15px; color: var(--color-ink)">
                  {{ billing.label || currentPlanMeta?.label || billing.plan }}
                </div>
                <div class="helptext" style="margin: 2px 0 0">
                  <span v-if="currentPlanMeta">{{ fmtAmount(currentPlanMeta) }}</span>
                  <span v-if="billing.current_period_end"> · échéance {{ fmtDate(billing.current_period_end) }}</span>
                </div>
              </div>
              <Tag :tone="isCompPlan ? 'saffron' : 'olive'">{{ isCompPlan ? 'comp' : (billing.method === 'sepa' ? 'sepa' : 'payé') }}</Tag>
              <Tag v-if="billing.status && billing.status !== 'active'" tone="terra">{{ billing.status }}</Tag>
            </div>
            <div v-else class="helptext" style="margin: 0">aucun plan — l'org est sur la gratuité (pas d'options débloquées par un plan).</div>

            <div v-if="canWrite && isCompPlan" style="border-top: 1px solid var(--color-hair); padding-top: 12px; display: flex; justify-content: flex-end">
              <Btn kind="danger" @click="clearPlan">Retirer le plan comp</Btn>
            </div>
            <div v-else-if="isPaidPlan" class="helptext" style="border-top: 1px solid var(--color-hair); padding-top: 12px; margin: 0">
              abonnement payant — la résiliation passe par l'org (facturation), pas par l'admin.
            </div>
          </div>
        </ConsoleCard>

        <!-- Identité de facturation + client Pennylane (#917) : posé à la main, jamais rapproché. -->
        <ConsoleCard v-if="isOperator && !billingIdentityError" title="identité de facturation"
          sub="qui est facturé, et sous quel client Pennylane. l'id se pose ici, à la main — le code ne rapproche ni ne crée jamais de client chez le comptable.">
          <template #actions>
            <Btn kind="mini" icon="pen" @click="editBillingIdentity">{{ billingIdentity?.identity ? 'modifier' : 'renseigner' }}</Btn>
          </template>
          <div class="rowlist">
            <div v-if="billingIdentity?.identity" style="display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap">
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 15px; color: var(--color-ink)">{{ billingIdentity.identity.legal_name }}</div>
                <div class="helptext" style="margin: 2px 0 0">
                  <span v-for="(l, idx) in identityLines" :key="idx">{{ idx ? ' · ' : '' }}{{ l }}</span>
                  <span v-if="identityLines.length"> · </span>{{ billingIdentity.identity.country_code }}
                  <span v-if="billingIdentity.identity.vat_number"> · TVA {{ billingIdentity.identity.vat_number }}</span>
                  <span v-if="billingIdentity.identity.billing_email"> · {{ billingIdentity.identity.billing_email }}</span>
                </div>
                <div v-if="billingIdentity.missing.length" class="helptext" style="margin: 4px 0 0; color: var(--color-terra)">
                  incomplète : {{ billingIdentity.missing.join(', ') }}
                </div>
              </div>
              <Tag v-if="billingIdentity.pennylane_customer_id != null" tone="olive">pennylane #{{ billingIdentity.pennylane_customer_id }}</Tag>
              <Tag v-else tone="terra">aucun client pennylane</Tag>
            </div>
            <div v-else class="helptext" style="margin: 0">aucune identité de facturation — rien ne peut être facturé à cette org tant qu'elle manque.</div>
          </div>
        </ConsoleCard>
  </div>

  <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
    :title="formDialog.title" :description="formDialog.description"
    :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
</template>
