<script setup lang="ts">
// Ce qu'Otomata OFFRE, dit là où on vient regarder ce qu'on paie.
//
// Un don d'option (`option_comps`, couche 3 d'ADR 0043) ouvre un avantage payant
// sans écrire la moindre ligne d'abonnement. Or l'écran de facturation lit
// l'abonnement — donc il vendait à ses bénéficiaires, prix affichés et bouton armé,
// exactement ce qu'ils possédaient déjà (mesuré côté serveur le 2026-09-02 : 32 dons
// vivants, un seul abonnement payant sur toute la plateforme).
//
// Cette carte se pose AU-DESSUS du catalogue, jamais à sa place : un don n'est pas
// un abonnement, et la voie pour en prendre un ne doit pas se refermer.
//
// ⚠️ On NOMME l'avantage (`label`, servi par le registre de connecteurs). Un
// « offert par Otomata » seul deviendrait faux le jour où un second avantage
// s'offre — et il n'y a pas que la messagerie qui coûte.
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Notice from '@/components/console/Notice.vue'
import Tag from '@/components/console/Tag.vue'
import { fmtDay } from '@/types/api'
import type { BillingGrant } from '@/types/api'

const props = defineProps<{ grants: BillingGrant[] }>()

// Même forme que le reste de l'écran de facturation : les prix du catalogue sont
// des euros entiers.
function euros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0 })
}

// « Ce que ça vaut » = ce qu'il faudrait payer pour l'avoir, hors taxes comme le
// catalogue juste en dessous. Muet si le serveur n'a pas de prix à donner : ne rien
// chiffrer vaut mieux qu'un montant inventé.
function worth(g: BillingGrant): string | null {
  if (g.value_amount == null) return null
  return `Cet avantage vaut ${euros(g.value_amount)} HT`
    + `${g.interval === 'month' ? ' par mois' : ''}.`
}

// À QUI il est offert. Un don posé sur un compte le suit d'une organisation à
// l'autre : le confondre avec un don d'espace ferait croire à un collègue qu'il en
// bénéficie aussi.
function scopeLine(g: BillingGrant): string {
  // Sans montant devant, « Il » n'aurait pas d'antécédent dans la phrase.
  const sujet = g.value_amount == null ? 'Cet avantage est ouvert' : 'Il est ouvert'
  return g.scope === 'user'
    ? `${sujet} pour votre compte : vous le gardez dans toutes vos organisations.`
    : `${sujet} pour toute l'organisation.`
}

// L'échéance du don. `expires_at` nul = SANS TERME : on ne dit rien plutôt que
// d'annoncer une fin qui n'existe pas.
//
// ⚠️ Ne jamais reprendre ici le « aucun paiement, aucune échéance » de l'abonnement
// offert : ce bloc-ci, lui, peut parfaitement en avoir une.
function deadline(g: BillingGrant): { tone: 'warn' | 'info'; text: string } | null {
  if (!g.expires_at) return null
  const jour = fmtDay(g.expires_at)
  const d = g.days_left
  // `days_left` NÉGATIF = l'échéance est passée. Surtout pas « expire aujourd'hui » —
  // et on dit par où rouvrir, sinon l'écran annonce une perte sans issue.
  if (d != null && d < 0) {
    return { tone: 'warn', text: `Cette offre a pris fin le ${jour}. `
      + 'Choisir un abonnement ci-dessous rouvre l\'accès.' }
  }
  if (d != null && d <= 30) {
    const reste = d === 0
      ? 'c\'est le dernier jour'
      : d === 1 ? 'il reste 1 jour' : `il reste ${d} jours`
    return { tone: 'warn', text: `Offert jusqu'au ${jour} — ${reste}.` }
  }
  return { tone: 'info', text: `Offert jusqu'au ${jour}.` }
}

// Mis en forme une fois : appeler `deadline()` trois fois depuis le template le
// ferait recalculer à chaque rendu, et rendrait la lecture du gabarit plus dure que
// la règle qu'il applique.
const rows = computed(() => props.grants.map((g) => ({
  key: `${g.scope}:${g.option}`,
  label: g.label,
  detail: g.detail,
  meta: [worth(g), scopeLine(g)].filter(Boolean).join(' '),
  deadline: deadline(g),
})))
</script>

<template>
  <ConsoleCard title="Ce qui vous est offert"
    sub="des avantages payants qu'Otomata vous ouvre sans contrepartie.">
    <div class="grants">
      <div v-for="r in rows" :key="r.key" class="grant">
        <div class="g-head">
          <span class="g-name">{{ r.label }}</span>
          <Tag tone="cobalt">offert par Otomata</Tag>
        </div>
        <p v-if="r.detail" class="g-detail">{{ r.detail }}</p>
        <p class="g-meta">{{ r.meta }}</p>
        <Notice v-if="r.deadline" :tone="r.deadline.tone" class="g-when">
          {{ r.deadline.text }}
        </Notice>
      </div>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.grants { display: flex; flex-direction: column; gap: 14px; }
/* Un filet entre deux avantages, pas une carte par avantage : ce sont des lignes
   d'une même liste, et encadrer chacune ferait concurrence aux cartes de paliers
   juste en dessous. */
.grant + .grant { padding-top: 14px; border-top: 1px solid var(--color-hair-soft); }
.g-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.g-name { font-weight: 700; font-size: 14px; color: var(--color-ink); }
.g-detail {
  font-size: var(--fs-small); color: var(--color-ink-soft); margin: 6px 0 0;
  line-height: 1.5;
}
.g-meta { font-size: 12px; color: var(--color-mute); margin: 6px 0 0; line-height: 1.5; }
.g-when { margin-top: 10px; }
</style>
