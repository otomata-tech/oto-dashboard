<script setup lang="ts">
// Le JOURNAL des tentatives de paiement d'un abonné — les échéances, la
// souscription, et depuis #845 les changements de moyen (un premier paiement à
// 0,00 : la ligne existe, son montant est nul). Extrait de `BillingView` sans
// changement de comportement, pour la même raison que le catalogue.
//
// Ce n'est PAS la carte des factures (au-dessus) : une facture est le document que
// les CGV promettent ; ceci n'est que la suite des tentatives.
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import type { BillingPayment } from '@/types/api'
import { fmtDateTime } from '@/types/api'
import { euros } from '@/lib/euros'

defineProps<{ payments: BillingPayment[] }>()

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
</script>

<template>
  <ConsoleCard flush title="Paiements" sub="les échéances de cet abonnement.">
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
