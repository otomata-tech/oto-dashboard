<script setup lang="ts">
// Le contrat de l'org : un abonnement réglé HORS PLATEFORME (bon de commande, virement),
// posé à la main par l'admin plateforme (`GET /orgs/{id}/contrat`, oto-commerce).
//
// Une org sous contrat a déjà payé : lui montrer l'offre et le tunnel, c'était l'inviter
// à payer une seconde fois — le commerce le refuse d'ailleurs (`409 under_contract`).
// Cette carte prend donc la PLACE de l'offre, tant que le contrat court. Clos, il ne
// masque plus rien et l'écran ne le montre pas (`contratEnCours`).
//
// ⚠️ `fin` nulle = reconduction tacite : on dit « sans échéance », jamais une date
// inventée. Un droit que cet écran ne connaît pas se montre sous son code (`droitLabel`).
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import { droitLabel } from '@/lib/billingTunnel'
import { fmtDay } from '@/types/api'
import type { CommerceContrat } from '@/types/api.commerce'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{ contrat: CommerceContrat }>()
</script>

<template>
  <ConsoleCard :title="t('billingUi.contract.title')" :sub="t('billingUi.contract.sub')">
    <template #actions>
      <Tag tone="olive">{{ t('billingUi.contract.running') }}</Tag>
    </template>

    <div class="grid3">
      <Stat v-if="contrat.licences != null" :label="t('billingUi.contract.licences')"
        :value="contrat.licences" />
      <Stat v-if="contrat.debut" :label="t('billingUi.contract.since')"
        :value="fmtDay(contrat.debut) ?? '—'" />
      <Stat :label="t('billingUi.contract.until')"
        :value="contrat.fin ? (fmtDay(contrat.fin) ?? '—') : t('billingUi.contract.noEnd')" />
    </div>

    <template v-if="contrat.droits.length">
      <p class="bct-label">{{ t('billingUi.contract.rights') }}</p>
      <ul class="bct-rights">
        <li v-for="d in contrat.droits" :key="d">{{ droitLabel(d) }}</li>
      </ul>
    </template>

    <p v-if="contrat.reference" class="bct-hint">
      {{ t('billingUi.contract.reference', { ref: contrat.reference }) }}</p>
    <p class="bct-hint">{{ t('billingUi.contract.offPlatform') }}</p>
  </ConsoleCard>
</template>

<style scoped>
.bct-label {
  margin: 16px 0 6px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint);
}
.bct-rights {
  margin: 0; padding-left: 18px; font-size: var(--fs-small); color: var(--color-ink);
  line-height: 1.6;
}
.bct-hint { font-size: 12px; color: var(--color-mute); margin: 14px 0 0; line-height: 1.5; }
</style>
