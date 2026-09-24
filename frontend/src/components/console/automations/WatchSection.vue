<script setup lang="ts">
// « À surveiller », sur l'entrée de l'espace Automatisations (oto#214) : ce qui tourne et ce
// qui demande un regard, sans descendre dans une page.
//   • les campagnes VIVANTES (`fleets op=list`), et celles armées sans premier travail ;
//   • les programmations qui perdent des occurrences (lues avec la présence du runner, par
//     la page : `triggers op=list`) ;
//   • les dernières exécutions en échec (`jobs op=list status=failed`, total servi).
// Les campagnes sont lues par la page (`useCampagnes`), partagées avec la liste des
// automatisations ; chaque bloc garde son erreur.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '../ConsoleCard.vue'
import Tag from '../Tag.vue'
import RunnerJobList from './RunnerJobList.vue'
import type { RunnerFleet, RunnerJobsFiltre, RunnerTrigger } from '@/api/console'
import type { Campagnes } from '@/composables/useCampagnes'
import { useMaintenant } from '@/composables/useRafraichissement'
import { nomProgrammation } from '@/lib/automationsEspace'
import { absDate } from '@/lib/cellRender'
import { armeeSansTravail, estVivante, libelleCampagne, nomCampagne } from '@/lib/runnerFleets'
import { duree } from '@/lib/runnerJobs'

const props = defineProps<{
  triggers: RunnerTrigger[]; triggersLus: boolean; triggersErreur: string | null; campagnes: Campagnes
}>()
const { t } = useI18n()
const maintenant = useMaintenant()

const vivantes = computed(() => props.campagnes.fleets.filter(estVivante))
const enPerte = computed(() => props.triggers.filter((tr) => (tr.expired_count ?? 0) > 0))
const ECHECS: RunnerJobsFiltre = { status: 'failed' }

function statut(f: RunnerFleet) {
  const l = libelleCampagne(f, null)
  return { ton: l.ton, texte: t(l.cle, l.params) }
}
function sansTravail(f: RunnerFleet): string | null {
  const ms = armeeSansTravail(f, maintenant.value)
  return ms === null ? null : t('automations.campaign.armedIdle', { duration: duree(ms) })
}

</script>

<template>
  <ConsoleCard :title="t('automations.watch.title')" :sub="t('automations.watch.sub')">
    <div class="card-body ws">
      <section class="ws-bloc" data-test="vivantes">
        <h4 class="ws-t">{{ t('automations.watch.live') }}</h4>
        <p v-if="campagnes.betaAbsente" class="ws-mute" data-test="beta">{{ t('automations.campaigns.betaOff') }}</p>
        <template v-else>
          <p v-if="campagnes.erreur" class="ws-err" role="alert">{{ t('automations.campaigns.error', { reason: campagnes.erreur }) }}</p>
          <p v-if="!campagnes.lu" class="ws-mute">{{ t('common.loading') }}</p>
          <p v-else-if="!vivantes.length && !campagnes.erreur" class="ws-mute">{{ t('automations.watch.liveEmpty') }}</p>
          <ul v-if="vivantes.length" class="ws-list">
            <li v-for="f in vivantes" :key="f.id" class="ws-item">
              <RouterLink :to="`/automations/campaigns/${f.id}`" class="ws-name">{{ nomCampagne(f) }}</RouterLink>
              <Tag :tone="statut(f).ton">{{ statut(f).texte }}</Tag>
              <span v-if="sansTravail(f)" class="ws-warn">{{ sansTravail(f) }}</span>
            </li>
          </ul>
        </template>
      </section>

      <section class="ws-bloc" data-test="en-perte">
        <h4 class="ws-t">{{ t('automations.watch.losing') }}</h4>
        <p v-if="triggersErreur" class="ws-err" role="alert">
          {{ t('automations.watch.schedulesError', { reason: triggersErreur }) }}</p>
        <p v-else-if="!triggersLus" class="ws-mute">{{ t('common.loading') }}</p>
        <p v-else-if="!enPerte.length" class="ws-mute">{{ t('automations.watch.losingEmpty') }}</p>
        <ul v-else class="ws-list">
          <li v-for="tr in enPerte" :key="tr.id" class="ws-item">
            <RouterLink :to="`/automations/schedules/${tr.id}`" class="ws-name">{{ nomProgrammation(tr) }}</RouterLink>
            <Tag tone="terra">{{ t('automations.triggers.notTaken', tr.expired_count ?? 0) }}</Tag>
            <span v-if="tr.expired_last" class="ws-mute">
              {{ t('automations.schedulePage.lostLast', { date: absDate(tr.expired_last) }) }}</span>
          </li>
        </ul>
      </section>

      <section class="ws-bloc" data-test="echecs">
        <div class="ws-row">
          <h4 class="ws-t">{{ t('automations.watch.failed') }}</h4>
          <RouterLink to="/automations/executions?status=failed" class="ws-lien">
            {{ t('automations.watch.failedAll') }}</RouterLink>
        </div>
        <RunnerJobList :filtre="ECHECS" :taille="5" />
      </section>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.ws { display: flex; flex-direction: column; gap: 16px; }
.ws-bloc { display: flex; flex-direction: column; gap: 8px; }
.ws-row { display: flex; align-items: baseline; gap: 12px; }
.ws-t { margin: 0; font-size: 12px; font-weight: 700; color: var(--color-ink); }
.ws-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ws-item { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px; }
.ws-name { font-weight: 600; color: var(--color-ink); }
.ws-name:hover, .ws-lien:hover { color: var(--color-saffron-ink); }
.ws-lien { font-size: 12px; font-weight: 600; color: var(--color-saffron-ink); }
.ws-warn { font-size: 12px; color: var(--color-saffron-ink); }
.ws-mute { margin: 0; font-size: 12.5px; color: var(--color-mute); }
.ws-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
