<script setup lang="ts">
// Le compteur d'usage — poser qu'oto a une limite, sobrement.
//
// ⚠️ **Ni barre, ni jauge, ni pourcentage, ni anneau.** L'usage médian mesuré est de
// 25 appels pour 1000 inclus : toute forme qui DIVISE les deux nombres afficherait
// une barre vide, et une barre vide dit « c'est gratuit et sans fin » — l'inverse
// exact de ce que ce bloc existe pour faire comprendre. On pose les deux nombres
// côte à côte et on laisse le lecteur les rapprocher lui-même.
//
// Le changement de ton se lit sur `over`, servi par le serveur. Jamais sur un ratio
// calculé ici : le seuil appartient à celui qui l'a choisi.
//
// ⚠️ Le dépassement n'entraîne AUCUN refus et AUCUNE surfacturation — le journal qui
// porte le chiffre est best-effort. La copie ne doit donc rien menacer : elle dit ce
// qui est, pas ce qui arriverait.
//
// ⚠️ Fenêtre = MOIS EN COURS uniquement. Aucune comparaison au mois dernier : la
// rétention du journal ne la permet pas, la donnée n'existe pas.
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Notice from '@/components/console/Notice.vue'
import Stat from '@/components/console/Stat.vue'
import { fmtDay } from '@/types/api'
import type { BillingUsage } from '@/types/api'

defineProps<{ usage: BillingUsage }>()

// « 1 000 » et non « 1000 » : c'est un nombre qu'on lit, pas un identifiant.
function nb(n: number): string {
  return n.toLocaleString('fr-FR')
}
</script>

<template>
  <ConsoleCard title="Utilisation"
    sub="les appels d'outil passés par vos agents ce mois-ci.">
    <!-- Les deux nombres CÔTE À CÔTE, jamais divisés l'un par l'autre. -->
    <div class="grid2">
      <Stat label="appels ce mois-ci" :value="nb(usage.calls)" />
      <Stat label="inclus" :value="nb(usage.included)" sub="par mois" />
    </div>

    <Notice v-if="usage.over" tone="warn" class="mt">
      Vous avez dépassé les appels inclus ce mois-ci. Rien n'est coupé, rien n'est
      facturé en plus.
    </Notice>

    <p class="hint">
      Décompte du mois en cours, depuis le {{ fmtDay(usage.period_start) }}.
      Il repart de zéro le 1er de chaque mois.
    </p>
  </ConsoleCard>
</template>

<style scoped>
/* Repris à l'identique de l'écran de facturation : mêmes tons, mêmes espacements. */
.mt { margin-top: 14px; }
.hint { font-size: 12px; color: var(--color-mute); margin: 14px 0 0; line-height: 1.5; }
</style>
