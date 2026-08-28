<script setup lang="ts">
// PREMIER écran du tunnel (#128) : qui paie, et depuis où.
//
// Ce n'est pas une fiche administrative de plus — c'est le pays saisi ici qui
// décide du régime de TVA, donc du montant réellement débité, et `subscribe` refuse
// (409 `billing_identity_required`) tant que les cinq champs requis ne sont pas là.
// D'où l'ordre du tunnel : identité, puis montant annoncé, puis consentement.
//
// La fiche part ENTIÈRE : le serveur remplace, il ne fusionne pas.
//
// ⚠️ Le numéro de TVA n'est pas contrôlé ici. Sa forme est vérifiée côté serveur,
// qui NOMME ce qu'il attend (« un numéro BE commence par "BE" », « attendu EL suivi
// de 9 chiffres ») : réécrire cette grammaire dans le front donnerait deux règles à
// tenir, et c'est la nôtre qui vieillirait.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '@/components/console/Btn.vue'
import Icon from '@/components/console/Icon.vue'
import Notice from '@/components/console/Notice.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import { setBillingIdentity } from '@/api/console'
import { EU_COUNTRIES, HOME_COUNTRY, countryOptions, vatPrefix } from '@/lib/countries'
import { IDENTITY_FIELD_LABEL } from '@/lib/billingTunnel'
import { explain } from '@/lib/errors'
import type { BillingIdentityView } from '@/types/api'

const props = defineProps<{
  view: BillingIdentityView | null
  /** Écriture réservée à l'org_admin (le serveur le garde aussi). */
  canManage: boolean
  /** Champs que le serveur vient de nommer comme manquants — surlignés tant qu'ils
   *  le restent. Vide en peinture à froid. */
  highlight?: string[]
}>()
const emit = defineEmits<{ saved: [BillingIdentityView] }>()

const { locale } = useI18n()

const draft = ref({
  legal_name: '', country_code: HOME_COUNTRY, address_line: '', address_line2: '',
  postal_code: '', city: '', vat_number: '', billing_email: '',
})
const busy = ref(false)
const error = ref<string | null>(null)
const saved = ref(false)

// Le formulaire se (re)remplit sur la fiche servie — y compris après un
// enregistrement, où la réponse est l'état rafraîchi et non un accusé.
watch(() => props.view, (v) => {
  const i = v?.identity
  if (!i) return
  draft.value = {
    legal_name: i.legal_name ?? '',
    country_code: i.country_code ?? HOME_COUNTRY,
    address_line: i.address_line ?? '',
    address_line2: i.address_line2 ?? '',
    postal_code: i.postal_code ?? '',
    city: i.city ?? '',
    vat_number: i.vat_number ?? '',
    billing_email: i.billing_email ?? '',
  }
}, { immediate: true })

const countries = computed(() => countryOptions(locale.value))

// Un client de l'Union hors France doit fournir un numéro de TVA intracommunautaire :
// sans lui, le guichet OSS serait nécessaire et il n'est pas en place — le serveur
// refuse alors la souscription (`vat_consumer_unsupported`). On le dit AVANT le clic.
const euNeedsVat = computed(() =>
  draft.value.country_code !== HOME_COUNTRY && EU_COUNTRIES.has(draft.value.country_code))

const vatPlaceholder = computed(() =>
  EU_COUNTRIES.has(draft.value.country_code)
    ? `${vatPrefix(draft.value.country_code)}…`
    : 'sans objet hors de l\'Union européenne')

// Surlignage : un champ nommé par le serveur le reste tant qu'il est vide.
function flagged(field: string): boolean {
  return (props.highlight ?? []).includes(field)
    && !String(draft.value[field as keyof typeof draft.value] ?? '').trim()
}

async function save() {
  busy.value = true
  error.value = null
  saved.value = false
  try {
    const d = draft.value
    const view = await setBillingIdentity({
      legal_name: d.legal_name.trim(),
      country_code: d.country_code,
      address_line: d.address_line.trim(),
      postal_code: d.postal_code.trim(),
      city: d.city.trim(),
      address_line2: d.address_line2.trim() || null,
      vat_number: d.vat_number.trim() || null,
      billing_email: d.billing_email.trim() || null,
    })
    saved.value = true
    emit('saved', view)
  } catch (e) {
    // Le refus du serveur est affiché mot pour mot : il nomme le champ et la forme
    // attendue, là où un message maison enverrait chercher la faute au hasard.
    error.value = explain(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="bif">
    <div class="bif-grid">
      <label class="bif-field bif-wide">
        <span class="bif-label">{{ IDENTITY_FIELD_LABEL.legal_name }}</span>
        <input v-model="draft.legal_name" class="inp" :class="{ flag: flagged('legal_name') }"
          :disabled="!canManage || busy" placeholder="telle qu'elle figurera sur la facture" />
      </label>

      <!-- Pas un <label> : il enveloppe un bouton (le select du DS), et le clic sur
           le libellé rouvrirait aussitôt le menu qu'il vient de fermer. -->
      <div class="bif-field">
        <span class="bif-label">{{ IDENTITY_FIELD_LABEL.country_code }}</span>
        <OtoSelect v-model="draft.country_code" :options="countries" grow
          :disabled="!canManage || busy" aria-label="pays de facturation"
          :trigger-class="flagged('country_code') ? 'oto-flag' : ''" />
      </div>

      <label class="bif-field">
        <span class="bif-label">Numéro de TVA intracommunautaire</span>
        <input v-model="draft.vat_number" class="inp mono" :disabled="!canManage || busy"
          :placeholder="vatPlaceholder" />
      </label>

      <label class="bif-field bif-wide">
        <span class="bif-label">{{ IDENTITY_FIELD_LABEL.address_line }}</span>
        <input v-model="draft.address_line" class="inp" :class="{ flag: flagged('address_line') }"
          :disabled="!canManage || busy" placeholder="numéro et voie" />
      </label>

      <label class="bif-field bif-wide">
        <span class="bif-label">Complément d'adresse</span>
        <input v-model="draft.address_line2" class="inp" :disabled="!canManage || busy"
          placeholder="bâtiment, étage (facultatif)" />
      </label>

      <label class="bif-field">
        <span class="bif-label">{{ IDENTITY_FIELD_LABEL.postal_code }}</span>
        <input v-model="draft.postal_code" class="inp" :class="{ flag: flagged('postal_code') }"
          :disabled="!canManage || busy" />
      </label>

      <label class="bif-field">
        <span class="bif-label">{{ IDENTITY_FIELD_LABEL.city }}</span>
        <input v-model="draft.city" class="inp" :class="{ flag: flagged('city') }"
          :disabled="!canManage || busy" />
      </label>

      <label class="bif-field bif-wide">
        <span class="bif-label">Adresse d'envoi des factures</span>
        <input v-model="draft.billing_email" class="inp" type="email"
          :disabled="!canManage || busy"
          placeholder="si elle diffère de celle de l'administrateur (facultatif)" />
      </label>
    </div>

    <Notice v-if="euNeedsVat && !draft.vat_number.trim()" tone="warn">
      Un client de l'Union européenne établi hors de France doit indiquer son numéro
      de TVA intracommunautaire : sans lui, la souscription en ligne n'est pas ouverte.
    </Notice>
    <Notice v-if="error" tone="warn">{{ error }}</Notice>

    <div v-if="canManage" class="bif-actions">
      <Btn icon="check" :disabled="busy" @click="save">Enregistrer</Btn>
      <span v-if="saved && !busy" class="bif-saved"><Icon name="ok" :size="14" /> enregistré</span>
    </div>
    <p v-else class="helptext">
      Seul un administrateur de l'organisation peut modifier ces informations.
    </p>
  </div>
</template>

<style scoped>
.bif { display: flex; flex-direction: column; gap: 14px; }
.bif-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
.bif-wide { grid-column: 1 / -1; }
.bif-field { display: flex; flex-direction: column; gap: 5px; }
.bif-label {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint);
}
/* Champ nommé par le serveur comme manquant — le même bord que le focus, en terra :
   l'œil va au champ à remplir sans qu'on ait à répéter la liste en prose. */
.bif-grid .flag,
.bif-grid :deep(.oto-flag) { border-color: var(--color-terra-ink); }
.bif-actions { display: flex; align-items: center; gap: 10px; }
.bif-saved {
  display: flex; align-items: center; gap: 5px; font-size: var(--fs-small);
  color: var(--color-olive-ink);
}
@media (max-width: 640px) {
  .bif-grid { grid-template-columns: 1fr; }
}
</style>
