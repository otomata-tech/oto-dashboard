<script setup lang="ts">
// Ce qu'Otomata OFFRE à l'organisation, dit là où on vient regarder ce qu'on paie :
// l'essai en cours et les dons de droits (`GET /orgs/{id}/avantages`, oto-commerce).
//
// Un don ouvre un avantage payant sans écrire la moindre ligne d'abonnement. Un écran de
// facturation qui ne lit que l'abonnement vend donc à ses bénéficiaires, prix affichés et
// bouton armé, exactement ce qu'ils possèdent déjà (mesuré côté serveur le 2026-09-02 :
// 32 dons vivants, un seul abonnement payant sur toute la plateforme).
//
// Cette carte se pose AU-DESSUS de l'offre, jamais à sa place : un don n'est pas un
// abonnement, et la voie pour en prendre un ne doit pas se refermer. Quand l'offre n'est
// PAS dessous (abonnement qui court, contrat en cours, attente d'ouverture), un don échu
// se dit échu sans renvoyer vers elle (`offerBelow`).
//
// ⚠️ On NOMME l'avantage (le droit du catalogue, traduit). Un « offert par Otomata » seul
// deviendrait faux le jour où un second avantage s'offre. Un droit que cet écran ne
// connaît pas se montre sous son code plutôt que de disparaître.
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Notice from '@/components/console/Notice.vue'
import Tag from '@/components/console/Tag.vue'
import { droitLabel } from '@/lib/billingTunnel'
import { fmtDay } from '@/types/api'
import type { CommerceAvantages } from '@/types/api.commerce'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  avantages: CommerceAvantages
  /** L'offre est affichée sous cette carte : un don échu peut y renvoyer. */
  offerBelow: boolean
}>()

const JOUR_MS = 24 * 60 * 60 * 1000

// L'échéance. `fin` nulle = SANS TERME : on ne dit rien plutôt que d'annoncer une fin
// qui n'existe pas.
//
// ⚠️ Ne jamais écrire ici « aucune échéance » : un don peut parfaitement en avoir une.
function deadline(fin: string | null): { tone: 'warn' | 'info'; text: string } | null {
  if (!fin) return null
  const jour = fmtDay(fin) ?? ''
  const reste = Date.parse(fin) - Date.now()
  // Une échéance PASSÉE : surtout pas « expire aujourd'hui » — et on dit par où rouvrir,
  // sinon l'écran annonce une perte sans issue.
  if (reste < 0) {
    const key = props.offerBelow ? 'billingUi.granted.ended' : 'billingUi.granted.endedPlain'
    return { tone: 'warn', text: t(key, { day: jour }) }
  }
  const d = Math.floor(reste / JOUR_MS)
  if (d <= 30) {
    const left = d === 0 ? t('billingUi.granted.lastDay') : t('billingUi.granted.daysLeft', { n: d }, d)
    return { tone: 'warn', text: t('billingUi.granted.until', { day: jour, left }) }
  }
  return { tone: 'info', text: t('billingUi.granted.untilPlain', { day: jour }) }
}

// Mis en forme une fois : l'essai d'abord (il couvre tout), puis les dons.
const rows = computed(() => [
  ...(props.avantages.essai ? [{
    key: 'essai', label: t('billingUi.granted.trial'), detail: t('billingUi.granted.trialDetail'),
    deadline: deadline(props.avantages.essai.fin),
  }] : []),
  ...props.avantages.dons.map((d) => ({
    key: `don:${d.droit}`, label: droitLabel(d.droit), detail: t('billingUi.granted.org'),
    deadline: deadline(d.fin),
  })),
])
</script>

<template>
  <ConsoleCard :title="t('billingUi.granted.title')"
    :sub="t('billingUi.granted.sub')">
    <div class="grants">
      <div v-for="r in rows" :key="r.key" class="grant">
        <div class="g-head">
          <span class="g-name">{{ r.label }}</span>
          <Tag tone="cobalt">{{ t('billingUi.granted.offered') }}</Tag>
        </div>
        <p class="g-detail">{{ r.detail }}</p>
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
   d'une même liste, et encadrer chacune ferait concurrence à l'offre juste en dessous. */
.grant + .grant { padding-top: 14px; border-top: 1px solid var(--color-hair-soft); }
.g-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.g-name { font-weight: 700; font-size: 14px; color: var(--color-ink); }
.g-detail {
  font-size: var(--fs-small); color: var(--color-ink-soft); margin: 6px 0 0;
  line-height: 1.5;
}
.g-when { margin-top: 10px; }
</style>
