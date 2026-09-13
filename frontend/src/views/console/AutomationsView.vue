<script setup lang="ts">
// /automations — suivre les agents qui tournent pour l'org, sans elle (oto#205, lot 1 :
// la lecture juste ; les gestes viennent au lot 2).
//
// Une section par responsabilité, dans l'ordre où on lit l'écran :
//   1. le RUNNER — un worker prend-il les travaux ? (bandeau)
//   2. les CAMPAGNES — le centre : statut vrai, compteurs de toute la campagne, travaux
//   3. les travaux HORS CAMPAGNE — repliés
//   4. les DÉCLENCHEURS programmés
//   5. les ROUTINES Claude Code
// La page tient le rafraîchissement (un seul bouton ; onglet visible seulement ; à
// intervalle seulement avec une campagne vivante) et la fiche d'un travail, qu'ouvrent
// toutes les listes.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '@/components/console/Btn.vue'
import Notice from '@/components/console/Notice.vue'
import RunnerJobDetail from '@/components/console/RunnerJobDetail.vue'
import RunnerTriggersCard from '@/components/console/RunnerTriggersCard.vue'
import CampaignsSection from '@/components/console/automations/CampaignsSection.vue'
import OffCampaignSection from '@/components/console/automations/OffCampaignSection.vue'
import RoutinesSection from '@/components/console/automations/RoutinesSection.vue'
import RunnerPresenceBanner from '@/components/console/automations/RunnerPresenceBanner.vue'
import type { RunnerArme, RunnerJob } from '@/api/console'
import { useCibleRun } from '@/composables/useCibleRun'
import { fournirRafraichissement } from '@/composables/useRafraichissement'

const { t } = useI18n()

const vivante = ref(false)
const { toutCharger, enCours } = fournirRafraichissement({ actif: () => vivante.value })

// La présence du runner arrive avec la liste des déclencheurs (même route) : la carte
// des déclencheurs la remonte, le bandeau l'affiche. Une erreur de cette lecture reste
// dans le bandeau et dans la carte, jamais ailleurs.
const runner = ref<RunnerArme | null>(null)
const runnerLu = ref(false)
const runnerErreur = ref<string | null>(null)
function surRunner(r: RunnerArme | null) {
  runner.value = r
  runnerErreur.value = null
  runnerLu.value = true
}
function surRunnerErreur(raison: string) {
  runnerErreur.value = raison
  runnerLu.value = true
}

const ouvert = ref<RunnerJob | null>(null)
const ouvrir = (job: RunnerJob) => { ouvert.value = job }
const { cible } = useCibleRun(ouvrir)
</script>

<template>
  <RunnerPresenceBanner :runner="runner" :loaded="runnerLu" :error="runnerErreur">
    <template #actions>
      <Btn kind="mini" :disabled="enCours" :aria-busy="enCours" @click="toutCharger">
        {{ enCours ? t('automations.refreshing') : t('automations.refresh') }}</Btn>
    </template>
  </RunnerPresenceBanner>

  <Notice v-if="cible" tone="info" class="av-cible">
    <template v-if="cible.etat === 'absent'">{{ t('automations.run.absent', { run: cible.run }) }}</template>
    <template v-else-if="cible.etat === 'hors-page'">
      {{ t('automations.run.horsPage', { run: cible.run, n: cible.lus }) }}</template>
    <template v-else>{{ t('automations.run.erreur', { run: cible.run, reason: cible.raison }) }}</template>
  </Notice>

  <CampaignsSection @vivante="(oui) => (vivante = oui)" @ouvrir="ouvrir" />
  <OffCampaignSection @ouvrir="ouvrir" />
  <RunnerTriggersCard @runner="surRunner" @runner-error="surRunnerErreur" />
  <RoutinesSection />

  <RunnerJobDetail :job="ouvert" @close="ouvert = null" />
</template>

<style scoped>
.av-cible { margin-bottom: 16px; }
</style>
