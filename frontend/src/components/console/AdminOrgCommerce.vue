<script setup lang="ts">
// La part COMMERCE de la fiche d'une organisation, côté admin plateforme — branchée sur
// l'API d'administration d'OTO-COMMERCE (`/api/admin/orgs/{id}`, oto-commerce
// `docs/api-utilisateur.md`). Le cœur d'une instance ne connaît ni abonnement ni facture
// (ADR 0070) : cette carte lit et écrit chez le commerce, avec son jeton.
//
// Ce qu'elle remplace : « forcer un plan offert » devient OFFRIR UN DROIT du catalogue
// (`PUT /dons/{droit}`, fin facultative) ; l'id client Pennylane devient l'identifiant
// client du logiciel comptable (`compta_client_id`) ; le contrat hors plateforme se pose
// et se clôt ici.
//
// ⚠️ Avant la bascule, le commerce refuse chaque geste (`409 before_switch`) : la
// facturation est encore au cœur. L'état le dit (`bascule_faite`), et un refus
// s'affiche TEL QUEL — c'est lui qui dit par où passer.
//
// La carte n'existe que pour un opérateur plateforme : le commerce relit le rôle
// plateforme de l'appelant et refuse tout autre.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import Notice from './Notice.vue'
import FormDialog from './FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import {
  adminCloreContrat, adminDownloadFacturePdf, adminPoserContrat, adminPoserDon, adminRetirerDon,
  adminSetIdentite, getAdminCommerce,
} from '@/api/console'
import type { CommerceEtatAdmin, CommerceFacture } from '@/types/api.commerce'
import { fmtDate, fmtDay } from '@/types/api'
import { euros } from '@/lib/euros'
import { explain, humanize } from '@/lib/errors'

const props = defineProps<{
  orgId: number
  orgName: string
  isOperator: boolean
}>()

const { t } = useI18n()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

// Les droits du catalogue du cœur, les seuls que le commerce accepte d'offrir ou de
// contracter (`reprise.CATALOGUE`, oto-commerce).
const CATALOGUE = ['unipile', 'platform_unmetered', 'unipile_seats', 'members_max']

const etat = ref<CommerceEtatAdmin | null>(null)
const loadError = ref<string | null>(null)

async function load() {
  if (!props.isOperator) return
  loadError.value = null
  try { etat.value = await getAdminCommerce(props.orgId) }
  catch (e) { etat.value = null; loadError.value = humanize(e) }
}
onMounted(load)
watch(() => props.orgId, load)

// Un geste : le refus du commerce (`before_switch` compris) s'affiche tel quel, et le
// formulaire reste ouvert (on relance l'erreur).
async function act(run: () => Promise<unknown>, done: string) {
  try { await run(); toast(done); await load() }
  catch (e) { toast(explain(e)); throw e }
}

// Une date saisie (AAAA-MM-JJ) → la fin de ce jour, avec son fuseau : le commerce lit une
// date ISO 8601, et une date sans heure ni fuseau serait ambiguë.
function finDuJour(raw: string | undefined): string | null {
  const d = (raw ?? '').trim()
  if (d === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast(t('billingUi.admin.invalidEnd')); throw new Error('invalid_end') }
  return `${d}T23:59:59+00:00`
}
function jour(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

// ── abonnement (lecture) ─────────────────────────────────────────────────────
const abonnement = computed(() => etat.value?.abonnement ?? null)

// ── contrat ──────────────────────────────────────────────────────────────────
const contrat = computed(() => etat.value?.contrat ?? null)
function editContract() {
  const c = contrat.value
  openForm({
    title: t('billingUi.admin.contractFormTitle'),
    description: t('billingUi.admin.contractFormDescription'),
    submitLabel: t('billingUi.admin.save'),
    fields: [
      { key: 'droits', label: t('billingUi.admin.rightsField'), required: true,
        initial: c?.droits.join(', ') ?? '', placeholder: 'unipile, platform_unmetered' },
      { key: 'licences', label: t('billingUi.admin.licencesField'), required: true,
        initial: c?.licences != null ? String(c.licences) : '' },
      { key: 'fin', label: t('billingUi.admin.endField'), initial: jour(c?.fin), placeholder: '2027-01-31' },
      { key: 'reference', label: t('billingUi.admin.refField'), initial: c?.reference ?? '' },
    ],
    onConfirm: async (v) => {
      const licences = (v.licences ?? '').trim()
      if (!/^\d+$/.test(licences)) { toast(t('billingUi.admin.invalidLicences')); throw new Error('invalid_licences') }
      const droits = (v.droits ?? '').split(',').map((d) => d.trim()).filter(Boolean)
      const fin = finDuJour(v.fin)
      await act(() => adminPoserContrat(props.orgId, {
        droits, licences: Number(licences), fin, reference: (v.reference ?? '').trim() || null,
      }), t('billingUi.admin.contractSaved'))
    },
  })
}
async function closeContract() {
  if (!await confirmAction({ title: t('billingUi.admin.closeContractTitle'), danger: true,
    confirmLabel: t('billingUi.admin.closeContract'), message: t('billingUi.admin.closeContractMessage') })) return
  await act(() => adminCloreContrat(props.orgId), t('billingUi.admin.contractClosed')).catch(() => {})
}

// ── dons ─────────────────────────────────────────────────────────────────────
const dons = computed(() => etat.value?.dons ?? [])
function offerRight() {
  openForm({
    title: t('billingUi.admin.giftFormTitle'),
    description: t('billingUi.admin.giftFormDescription'),
    submitLabel: t('billingUi.admin.offer'),
    fields: [
      { key: 'droit', label: t('billingUi.admin.rightField'), type: 'select', required: true,
        initial: CATALOGUE[0], options: CATALOGUE.map((d) => ({ value: d, label: d })) },
      { key: 'fin', label: t('billingUi.admin.endField'), placeholder: '2027-01-31' },
    ],
    onConfirm: async (v) => {
      const fin = finDuJour(v.fin)
      await act(() => adminPoserDon(props.orgId, v.droit ?? '', fin), t('billingUi.admin.giftSaved'))
    },
  })
}
async function removeGift(droit: string) {
  if (!await confirmAction({ title: t('billingUi.admin.removeGiftTitle'), danger: true,
    confirmLabel: t('billingUi.admin.removeGift'), message: t('billingUi.admin.removeGiftMessage', { droit }) })) return
  await act(() => adminRetirerDon(props.orgId, droit), t('billingUi.admin.giftRemoved')).catch(() => {})
}

// ── identité de facturation + client du logiciel comptable ───────────────────
// L'identifiant client n'est jamais rapproché ni créé par le code : un admin plateforme le
// DÉSIGNE ici, à la main. La fiche part ENTIÈRE (le serveur remplace, il ne fusionne pas) :
// le formulaire est prérempli et reposte tout, un identifiant vide RETIRE la désignation.
const identite = computed(() => etat.value?.identite ?? null)
const identityLines = computed(() => {
  const i = identite.value
  if (!i) return []
  return [i.address_line, [i.postal_code, i.city].filter(Boolean).join(' ')]
    .filter((s): s is string => !!s && s.trim() !== '')
})
function editIdentity() {
  const i = identite.value
  openForm({
    title: t('billingUi.admin.identityTitle'),
    description: t('billingUi.admin.identityFormDescription'),
    submitLabel: t('billingUi.admin.save'),
    fields: [
      { key: 'legal_name', label: t('billingUi.admin.legalNameField'), required: true, initial: i?.legal_name ?? props.orgName },
      { key: 'country_code', label: t('billingUi.admin.countryField'), required: true, initial: i?.country_code ?? 'FR', placeholder: 'FR' },
      { key: 'vat_number', label: t('billingUi.admin.vatField'), initial: i?.vat_number ?? '', placeholder: 'FR12345678901' },
      { key: 'address_line', label: t('billingUi.admin.addressField'), required: true, initial: i?.address_line ?? '' },
      { key: 'postal_code', label: t('billingUi.admin.postalCodeField'), required: true, initial: i?.postal_code ?? '' },
      { key: 'city', label: t('billingUi.admin.cityField'), required: true, initial: i?.city ?? '' },
      { key: 'email', label: t('billingUi.admin.emailField'), required: true, initial: i?.email ?? '' },
      { key: 'compta_client_id', label: t('billingUi.admin.comptaIdField'), initial: i?.compta_client_id ?? '' },
    ],
    onConfirm: async (v) => {
      const s = (x?: string) => (x ?? '').trim()
      await act(() => adminSetIdentite(props.orgId, {
        legal_name: s(v.legal_name), country_code: s(v.country_code), vat_number: s(v.vat_number) || null,
        address_line: s(v.address_line), postal_code: s(v.postal_code), city: s(v.city), email: s(v.email),
        compta_client_id: s(v.compta_client_id) || null,
      }), t('billingUi.admin.identitySaved'))
    },
  })
}

const factures = computed(() => etat.value?.factures ?? [])
async function downloadPdf(f: CommerceFacture) {
  try { await adminDownloadFacturePdf(props.orgId, f.id, f.pdf_nom ?? `facture-${f.numero ?? f.id}.pdf`) }
  catch (e) { toast(explain(e)) }
}
</script>

<template>
  <template v-if="isOperator">
    <div class="eyebrow" style="margin: 26px 0 8px">{{ t('billingUi.admin.eyebrow') }}</div>
    <Notice v-if="loadError" tone="warn">
      {{ loadError }}
      <Btn kind="link" icon="chev" @click="load">{{ t('common.retry') }}</Btn>
    </Notice>
    <template v-else-if="etat">
      <Notice v-if="!etat.bascule_faite" tone="info" style="margin-bottom: 14px">{{ t('billingUi.admin.beforeSwitch') }}</Notice>
      <div class="grid2">
        <!-- Abonnement : réglé par l'org sur la plateforme, lu ici sans geste. -->
        <ConsoleCard :title="t('billingUi.admin.subscriptionTitle')" :sub="t('billingUi.admin.subscriptionSub')">
          <div class="rowlist">
            <div v-if="abonnement" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 15px; color: var(--color-ink)">
                  <template v-if="abonnement.tarif === 'forfait'">
                    {{ t('billingUi.admin.forfait', { amount: euros(abonnement.forfait_ht ?? 0) }) }}</template>
                  <template v-else>{{ t('billingUi.admin.seats', { n: abonnement.places }, abonnement.places) }}</template>
                </div>
                <div class="helptext" style="margin: 2px 0 0">
                  <span v-if="abonnement.places_suivantes != null">{{ t('billingUi.admin.seatsNext', { n: abonnement.places_suivantes }) }} · </span>
                  <span v-if="abonnement.periode_fin">{{ t('billingUi.admin.until', { date: fmtDate(abonnement.periode_fin) }) }}</span>
                  <span v-if="abonnement.resilie_le"> · {{ t('billingUi.admin.canceledOn', { date: fmtDate(abonnement.resilie_le) }) }}</span>
                </div>
              </div>
              <Tag :tone="abonnement.statut === 'active' ? 'olive' : abonnement.statut === 'canceled' ? 'ink' : 'terra'">{{ abonnement.statut }}</Tag>
            </div>
            <div v-else class="helptext" style="margin: 0">{{ t('billingUi.admin.noSubscription') }}</div>
          </div>
        </ConsoleCard>

        <!-- Contrat hors plateforme : droits + licences, posé et clos à la main. -->
        <ConsoleCard :title="t('billingUi.admin.contractTitle')" :sub="t('billingUi.admin.contractSub')">
          <template #actions>
            <Btn kind="mini" icon="pen" @click="editContract">{{ contrat ? t('billingUi.admin.editContract') : t('billingUi.admin.setContract') }}</Btn>
          </template>
          <div class="rowlist">
            <div v-if="contrat" style="display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap">
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 15px; color: var(--color-ink)">{{ contrat.droits.join(', ') }}</div>
                <div class="helptext" style="margin: 2px 0 0">
                  <span v-if="contrat.licences != null">{{ t('billingUi.admin.licences', { n: contrat.licences }, contrat.licences) }}</span>
                  <span> · {{ contrat.fin ? t('billingUi.admin.until', { date: fmtDate(contrat.fin) }) : t('billingUi.admin.noEnd') }}</span>
                  <span v-if="contrat.reference"> · {{ t('billingUi.admin.ref', { ref: contrat.reference }) }}</span>
                </div>
              </div>
            </div>
            <div v-else class="helptext" style="margin: 0">{{ t('billingUi.admin.noContract') }}</div>
            <div v-if="contrat" style="border-top: 1px solid var(--color-hair); padding-top: 12px; display: flex; justify-content: flex-end">
              <Btn kind="danger" @click="closeContract">{{ t('billingUi.admin.closeContract') }}</Btn>
            </div>
          </div>
        </ConsoleCard>

        <!-- Dons : un droit du catalogue offert à l'org (remplace « forcer un plan offert »). -->
        <ConsoleCard :title="t('billingUi.admin.giftsTitle')" :sub="t('billingUi.admin.giftsSub')">
          <template #actions>
            <Btn kind="mini" icon="plus" @click="offerRight">{{ t('billingUi.admin.offer') }}</Btn>
          </template>
          <div class="rowlist">
            <div v-for="d in dons" :key="d.droit" style="display: flex; align-items: center; gap: 10px">
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; color: var(--color-ink)">{{ d.droit }}</div>
                <div class="helptext" style="margin: 2px 0 0">{{ d.fin ? t('billingUi.admin.until', { date: fmtDate(d.fin) }) : t('billingUi.admin.noEnd') }}</div>
              </div>
              <Btn kind="danger" @click="removeGift(d.droit)">{{ t('billingUi.admin.removeGift') }}</Btn>
            </div>
            <div v-if="!dons.length" class="helptext" style="margin: 0">{{ t('billingUi.admin.noGifts') }}</div>
          </div>
        </ConsoleCard>

        <!-- Identité de facturation + client du logiciel comptable : posé à la main, jamais rapproché. -->
        <ConsoleCard :title="t('billingUi.admin.identityTitle')" :sub="t('billingUi.admin.identitySub')">
          <template #actions>
            <Btn kind="mini" icon="pen" @click="editIdentity">{{ identite ? t('billingUi.admin.edit') : t('billingUi.admin.fill') }}</Btn>
          </template>
          <div class="rowlist">
            <div v-if="identite" style="display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap">
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 15px; color: var(--color-ink)">{{ identite.legal_name }}</div>
                <div class="helptext" style="margin: 2px 0 0">
                  <span v-for="(l, idx) in identityLines" :key="idx">{{ idx ? ' · ' : '' }}{{ l }}</span>
                  <span v-if="identityLines.length"> · </span>{{ identite.country_code }}
                  <span v-if="identite.vat_number"> · {{ identite.vat_number }}</span>
                  <span v-if="identite.email"> · {{ identite.email }}</span>
                </div>
              </div>
              <Tag v-if="identite.compta_client_id" tone="olive">{{ t('billingUi.admin.comptaId', { id: identite.compta_client_id }) }}</Tag>
              <Tag v-else tone="terra">{{ t('billingUi.admin.noComptaId') }}</Tag>
            </div>
            <div v-else class="helptext" style="margin: 0">{{ t('billingUi.admin.identityMissing') }}</div>
          </div>
        </ConsoleCard>

        <!-- Factures : le relevé de ce que le commerce a émis pour l'org. -->
        <ConsoleCard :title="t('billingUi.admin.invoicesTitle')">
          <div class="rowlist">
            <div v-for="f in factures" :key="f.id" style="display: flex; align-items: center; gap: 10px">
              <span class="mono" style="flex: 1">{{ f.numero ?? `#${f.id}` }}</span>
              <span class="dim">{{ fmtDay(f.emise_le) ?? '—' }}</span>
              <span class="mono">{{ f.montant_ttc == null ? '—' : euros(f.montant_ttc) }}</span>
              <Tag :tone="f.nature === 'credit_note' ? 'cobalt' : 'ink'">{{ f.statut }}</Tag>
              <Btn v-if="f.pdf" kind="mini" icon="download" @click="downloadPdf(f)">{{ t('billingUi.invoices.pdf') }}</Btn>
            </div>
            <div v-if="!factures.length" class="helptext" style="margin: 0">{{ t('billingUi.admin.noInvoices') }}</div>
          </div>
        </ConsoleCard>
      </div>
    </template>
  </template>

  <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
    :title="formDialog.title" :description="formDialog.description"
    :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
</template>
