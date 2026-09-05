<script setup lang="ts">
// Le CATALOGUE des paliers — la carte « Choisir un abonnement » d'une org qui n'a
// pas d'abonnement. Extrait de `BillingView` sans changement de comportement : la
// vue portait déjà le retour du paiement, l'état d'abonnement et ses alertes, et
// les deux gestes de #845 (changer de carte, annuler une résiliation) l'auraient
// fait passer la limite de taille. Le catalogue est la partie la plus autonome :
// il lit les paliers, il émet le palier choisi, rien d'autre.
//
// « Choisir » et non « S'abonner » : le clic ouvre le tunnel, il n'engage aucun
// paiement.
import Btn from '@/components/console/Btn.vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Icon from '@/components/console/Icon.vue'
import Tag from '@/components/console/Tag.vue'
import type { BillingPlan } from '@/types/api'
import { euros as euroCents } from '@/lib/euros'

defineProps<{
  plans: BillingPlan[]
  /** Souscrire est réservé à l'org_admin (le serveur le garde aussi) : à un
   * membre, la carte dit qui peut, sans bouton qui refuserait au clic. */
  canManage: boolean
}>()
const emit = defineEmits<{ choose: [plan: BillingPlan] }>()

// Le mot du CATALOGUE pour un palier sans prix ; la règle d'écriture d'un montant
// vit dans `lib/euros`.
function euros(cents: number | null | undefined): string {
  return cents == null ? 'sur devis' : euroCents(cents)
}

// Le seul axe qui varie réellement entre paliers (backend : options + unmetered
// identiques partout — cf. billing.py PLANS). Le reste = « inclus dans tous les plans ».
function accountsLabel(p: BillingPlan): string {
  if (p.unipile_accounts == null) return 'Comptes messagerie illimités'
  if (p.unipile_accounts === 1) return '1 compte messagerie connecté'
  return `${p.unipile_accounts} comptes messagerie connectés`
}

function contactSales() {
  window.location.href = 'mailto:contact@otomata.tech?subject=Abonnement%20Entreprise'
}
</script>

<template>
  <ConsoleCard title="Choisir un abonnement"
    :sub="canManage ? 'un abonnement par organisation, sans engagement — paiement par carte bancaire.'
      : 'seul un administrateur de l\'organisation peut souscrire.'">
    <div class="grid3">
      <div v-for="p in plans" :key="p.plan" class="plan" :class="{ custom: p.custom }">
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
            <Btn icon="card" @click="emit('choose', p)">Choisir</Btn>
          </template>
        </div>
      </div>
    </div>

    <p class="hint">Les prix sont hors taxes ; la TVA applicable est calculée à
      l'étape suivante, à partir de votre pays de facturation.</p>

    <div class="incl">
      <div class="incl-h">Inclus dans tous les plans</div>
      <ul class="incl-list">
        <li><Icon name="ok" :size="15" /> Messagerie LinkedIn &amp; WhatsApp (Unipile)</li>
        <li><Icon name="ok" :size="15" /> Connecteurs de données sans quota d'appel</li>
        <li><Icon name="ok" :size="15" /> Données entreprises France, CRM, e-mail &amp; base de connaissance</li>
      </ul>
    </div>
  </ConsoleCard>
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

.hint { font-size: 12px; color: var(--color-mute); margin: 14px 0 0; line-height: 1.5; }
</style>
