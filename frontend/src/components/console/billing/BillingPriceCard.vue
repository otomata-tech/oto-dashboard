<script setup lang="ts">
// Le montant, annoncé AVANT le consentement et avant la page de paiement (#128).
//
// « Ce que vous réglerez » est le TTC, pas le prix du palier : le payeur ne doit pas
// découvrir la TVA chez le prestataire. Le régime et le taux viennent de l'API — le
// front ne classe personne, il rapproche le taux servi du prix du catalogue
// (cf. l'avertissement de tête de `lib/billingTunnel`).
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Notice from '@/components/console/Notice.vue'
import Tag from '@/components/console/Tag.vue'
import { VAT_BLOCKED_MESSAGE, VAT_SCHEME_LABEL, VAT_SCHEME_NOTE, type PriceParts } from '@/lib/billingTunnel'
import type { VatBlocked, VatScheme } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  planLabel: string
  /** `null` tant que le régime n'est pas tranché — `blocked` dit alors pourquoi. */
  price: PriceParts | null
  scheme: VatScheme | null
  blocked: VatBlocked | null
}>()

function euros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}
</script>

<template>
  <ConsoleCard :title="t('billingUi.price.title', { plan: planLabel })"
    :sub="t('billingUi.price.sub')">
    <template #actions>
      <Tag v-if="scheme" tone="cobalt">{{ VAT_SCHEME_LABEL[scheme] }}</Tag>
    </template>

    <template v-if="price">
      <dl class="bpc">
        <div><dt>{{ t('billingUi.price.ht') }}</dt><dd>{{ euros(price.ht) }}</dd></div>
        <div><dt>{{ t('billingUi.price.vat') }}</dt><dd>{{ euros(price.vat) }}</dd></div>
        <div class="total"><dt>{{ t('billingUi.price.total') }}</dt><dd>{{ euros(price.ttc) }}</dd></div>
      </dl>
      <p v-if="scheme" class="helptext">{{ VAT_SCHEME_NOTE[scheme] }}</p>
    </template>
    <Notice v-else-if="blocked" tone="warn">{{ VAT_BLOCKED_MESSAGE[blocked] }}</Notice>
    <Notice v-else tone="info">
      {{ t('billingUi.price.pending') }}
    </Notice>
  </ConsoleCard>
</template>

<style scoped>
.bpc { display: flex; flex-direction: column; gap: 8px; max-width: 380px; }
.bpc > div {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  font-size: var(--fs-small); color: var(--color-ink-soft);
}
.bpc dt { margin: 0; }
.bpc dd { margin: 0; font-family: var(--font-mono); color: var(--color-ink); }
.bpc .total {
  padding-top: 8px; border-top: 1px solid var(--color-hair-soft);
  font-weight: 700; color: var(--color-ink);
}
.bpc .total dd { font-size: 16px; }
</style>
