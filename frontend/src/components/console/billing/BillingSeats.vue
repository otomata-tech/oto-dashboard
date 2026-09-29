<script setup lang="ts">
// L'OFFRE d'une org qui n'a pas d'abonnement : on choisit un nombre de membres (des
// places), au prix d'une place que sert oto-commerce (`GET /api/tarif`). Plus de
// paliers : le prix est le même pour tous, seul le nombre varie.
//
// « Continuer » et non « S'abonner » : le clic ouvre le tunnel (identité → montant TTC →
// conditions), il n'engage aucun paiement.
import { computed, ref } from 'vue'
import Btn from '@/components/console/Btn.vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Icon from '@/components/console/Icon.vue'
import Notice from '@/components/console/Notice.vue'
import type { CommerceTarif } from '@/types/api.commerce'
import { euros } from '@/lib/euros'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  tarif: CommerceTarif
  /** Le nombre proposé d'abord (celui d'un tunnel dont on revient). */
  initial?: number
  /** Le dernier paiement de souscription n'a pas abouti : rien n'a été débité. */
  lastFailed?: boolean
}>()
const emit = defineEmits<{ choose: [places: number] }>()

const places = ref(Math.max(1, props.initial ?? 1))
// Un entier ≥ 1, sinon pas de levier : le commerce refuserait (`invalid_places`).
const valid = computed(() => Number.isInteger(places.value) && places.value >= 1)
const total = computed(() => valid.value ? places.value * props.tarif.prix_ht_par_place : null)
</script>

<template>
  <ConsoleCard :title="t('billingUi.seats.title')" :sub="t('billingUi.seats.sub')">
    <Notice v-if="lastFailed" tone="info" class="bs-notice">{{ t('billingUi.seats.lastFailed') }}</Notice>

    <div class="bs">
      <div class="bs-price">
        <span class="amt">{{ euros(tarif.prix_ht_par_place) }}</span>
        <span class="per">{{ t('billingUi.seats.perSeat') }}</span>
      </div>

      <label class="bs-field">
        <span class="bs-label">{{ t('billingUi.seats.count') }}</span>
        <input v-model.number="places" class="inp bs-input" type="number" min="1" step="1" />
      </label>
      <p v-if="total != null" class="bs-total">{{ t('billingUi.seats.total', { amount: euros(total) }) }}</p>
      <p class="hint">{{ t('billingUi.seats.rule') }}</p>

      <div>
        <Btn icon="card" :disabled="!valid" @click="emit('choose', places)">{{ t('billingUi.seats.continue') }}</Btn>
      </div>
    </div>

    <p class="hint">{{ t('billingUi.seats.taxes') }}</p>

    <div class="incl">
      <div class="incl-h">{{ t('billingUi.seats.included') }}</div>
      <ul class="incl-list">
        <li><Icon name="ok" :size="15" /> {{ t('billingUi.seats.messaging') }}</li>
        <li><Icon name="ok" :size="15" /> {{ t('billingUi.seats.noQuota') }}</li>
        <li><Icon name="ok" :size="15" /> {{ t('billingUi.seats.data') }}</li>
      </ul>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.bs { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
.bs-notice { margin-bottom: 14px; }
.bs-price { display: flex; align-items: baseline; gap: 6px; }
.bs-price .amt {
  font-size: 26px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1;
  color: var(--color-ink);
}
.bs-price .per { font-size: 12px; color: var(--color-mute); }
.bs-field { display: flex; flex-direction: column; gap: 5px; }
.bs-label {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint);
}
.bs-input { width: 120px; }
.bs-total { margin: 0; font-size: var(--fs-small); color: var(--color-ink); font-weight: 600; }

/* Bande « inclus » — ce qu'ouvre chaque place, dit une seule fois. */
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

.hint { font-size: 12px; color: var(--color-mute); margin: 14px 0 0; line-height: 1.5; }
.bs .hint { margin: 0; }
</style>
