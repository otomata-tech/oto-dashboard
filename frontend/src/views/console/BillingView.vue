<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import StateEmpty from '@/components/console/StateEmpty.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { getBillingPacks, getBillingTransactions, startCheckout } from '@/api/console'
import type { CreditPack, CreditTransaction } from '@/types/api'
import { fmtDateTime } from '@/types/api'
import { humanize } from '@/lib/errors'
// Unovis lourd → chunk async, chargé seulement s'il y a un historique (v-if ci-dessous).
const CreditHistoryChart = defineAsyncComponent(() => import('@/components/console/CreditHistoryChart.vue'))

// Wallet de credits PAR ORG (le solde vient de me.billing, déjà chargé au boot).
// 1 appel MCP = 1 credit ; stock de base gratuit puis recharge par packs Stripe.
// Soft : le solde peut être négatif, on n'a jamais bloqué l'appel.
const { me, reload } = useMe()
const { toast } = useToast()
const route = useRoute()
const router = useRouter()

const packs = ref<CreditPack[]>([])
const transactions = ref<CreditTransaction[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)
const buying = ref<string | null>(null)

const billing = computed(() => me.value?.billing ?? null)
const hasOrg = computed(() => me.value?.active_org != null)

const euros = (cents: number) => (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })
// Prix unitaire (cents/appel) — la dégressivité, lisible sur chaque pack.
const perCall = (p: CreditPack) => (p.amount_cents / p.calls).toFixed(p.amount_cents / p.calls < 1 ? 2 : 0)

const reasonLabel = (r: string) =>
  ({ stripe: 'top-up', base_grant: 'free base stock', admin_adjust: 'admin adjustment' } as Record<string, string>)[r] ?? r

async function buy(pack: CreditPack) {
  buying.value = pack.pack_id
  try {
    const { checkout_url } = await startCheckout(pack.pack_id)
    window.location.assign(checkout_url)   // redirige vers Stripe Checkout
  } catch (e) {
    error.value = humanize(e)
    buying.value = null
  }
}

onMounted(async () => {
  // Retour de Stripe Checkout : ?status=success|cancel.
  const status = route.query.status
  if (status === 'success') {
    toast('payment received — credits added')
    reload()                               // rafraîchit me.billing (solde à jour)
    router.replace({ query: {} })
  } else if (status === 'cancel') {
    toast('checkout cancelled')
    router.replace({ query: {} })
  }
  try {
    packs.value = (await getBillingPacks()).packs
    if (hasOrg.value) transactions.value = (await getBillingTransactions()).transactions
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
  }
})
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <StateEmpty v-if="loaded && !hasOrg">
      <template #title>credits live in an organization.</template>
      billing is per-org: each organization gets a free base stock of calls, then tops up with
      credit packs. join or create an organization to see its balance and recharge.
      <template #cta>
        <Btn @click="router.push('/org')">manage organization</Btn>
      </template>
    </StateEmpty>

    <template v-else>
      <!-- ── solde ── -->
      <div class="grid3">
        <Stat label="call credits" :value="(billing?.balance ?? 0).toLocaleString('en-US')"
          :tone="billing?.low ? 'var(--color-terra-ink)' : undefined"
          :sub="billing?.low ? 'running low — top up below' : '1 mcp call = 1 credit'" />
        <Stat label="status" :value="billing?.low ? 'low' : 'ok'"
          :tone="billing?.low ? 'var(--color-terra-ink)' : 'var(--color-olive-ink)'"
          sub="calls are never blocked — balance may go negative" />
        <Stat label="free base stock" :value="billing?.base_granted ? 'granted' : 'pending'"
          sub="one-time welcome credits per org" />
      </div>

      <!-- ── packs ── -->
      <ConsoleCard title="recharge credits" sub="one-time purchase via stripe. bigger packs = cheaper per call.">
        <div class="packs">
          <div v-for="p in packs" :key="p.pack_id" class="pack">
            <div class="pack-calls">{{ p.calls.toLocaleString('en-US') }}<span> calls</span></div>
            <div class="pack-price">€{{ euros(p.amount_cents) }}</div>
            <div class="pack-rate">≈ {{ perCall(p) }} ct / call</div>
            <Btn kind="mini" :disabled="!!buying" @click="buy(p)">
              {{ buying === p.pack_id ? 'redirecting…' : 'buy' }}
            </Btn>
          </div>
        </div>
      </ConsoleCard>

      <!-- ── historique ── -->
      <ConsoleCard flush title="credit history" sub="top-ups, the free base stock, and admin adjustments. per-call usage is metered live on your balance.">
        <div v-if="transactions.length > 1" class="card-body">
          <CreditHistoryChart :transactions="transactions" />
        </div>
        <table class="tbl">
          <thead><tr><th style="width: 18px"></th><th>movement</th><th class="num">credits</th><th class="num">at</th></tr></thead>
          <tbody>
            <tr v-for="t in transactions" :key="t.id">
              <td><Dot :tone="t.delta >= 0 ? 'olive' : 'terra'" :size="7" /></td>
              <td>{{ reasonLabel(t.reason) }}</td>
              <td class="num" :style="{ color: t.delta >= 0 ? 'var(--color-olive-ink)' : 'var(--color-terra-ink)' }">
                {{ t.delta >= 0 ? '+' : '' }}{{ t.delta.toLocaleString('en-US') }}
              </td>
              <td class="num dim">{{ fmtDateTime(t.created_at) }}</td>
            </tr>
            <tr v-if="loaded && !transactions.length">
              <td colspan="4" class="dim" style="text-align: center; padding: 16px">no movements yet</td>
            </tr>
          </tbody>
        </table>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.packs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
}
.pack {
  border: 1px solid var(--color-hair);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.pack-calls { font-size: 1.25rem; font-weight: 600; color: var(--color-ink); }
.pack-calls span { font-size: 0.85rem; font-weight: 400; color: var(--color-ink-soft); }
.pack-price { font-size: 1.05rem; color: var(--color-saffron-ink); }
.pack-rate { font-size: 0.8rem; color: var(--color-ink-soft); margin-bottom: 8px; }
</style>
