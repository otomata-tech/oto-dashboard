<script setup lang="ts">
// Le JOURNAL des tentatives de paiement de l'org (`GET /orgs/{id}/paiements`, oto-commerce)
// — la souscription, les échéances, et les changements de moyen (un premier paiement à
// 0,00 : la ligne existe, son montant est nul).
//
// Ce n'est PAS la carte des factures (au-dessus) : une facture est le document que les
// CGV promettent ; ceci n'est que la suite des tentatives.
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import type { CommercePaiement } from '@/types/api.commerce'
import { fmtDateTime } from '@/types/api'
import { euros } from '@/lib/euros'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Le commerce sert le journal du plus récent au plus ancien : on le montre tel quel.
defineProps<{ payments: CommercePaiement[] }>()

function payKind(kind: string): string {
  if (kind === 'initial') return t('billingUi.payments.initial')
  if (kind === 'renewal') return t('billingUi.payments.renewal')
  if (kind === 'method_change') return t('billingUi.payments.methodChange')
  return kind
}
function payTone(s: string): 'olive' | 'terra' | 'ink' {
  // statuts Mollie : paid = encaissé ; pending/open/authorized = en cours ;
  // failed/canceled/expired = échec.
  if (['paid', 'authorized'].includes(s)) return 'olive'
  if (['failed', 'canceled', 'expired'].includes(s)) return 'terra'
  return 'ink'
}
// Le montant réellement pris (TTC). Une ligne reprise du cœur peut ne pas le porter :
// on ne le reconstitue pas.
function amount(p: CommercePaiement): string {
  return p.montant_ttc == null ? '—' : euros(p.montant_ttc)
}
</script>

<template>
  <ConsoleCard flush :title="t('billingUi.payments.title')" :sub="t('billingUi.payments.sub')">
    <table class="tbl">
      <thead>
        <tr><th>{{ t('billingUi.payments.date') }}</th><th>{{ t('billingUi.payments.kind') }}</th><th class="num">{{ t('billingUi.payments.amount') }}</th><th>{{ t('billingUi.payments.status') }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in payments" :key="p.id">
          <td class="mono">{{ fmtDateTime(p.created_at) }}</td>
          <td>{{ payKind(p.nature) }}</td>
          <td class="num">{{ amount(p) }}</td>
          <td><Tag :tone="payTone(p.statut)">{{ p.statut }}</Tag></td>
        </tr>
      </tbody>
    </table>
  </ConsoleCard>
</template>
