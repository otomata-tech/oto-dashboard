<script setup lang="ts">
// /automations/executions — le suivi TRANSVERSE des exécutions de l'org (oto#214) : la file
// servie, paginée par curseur, sous les seuls filtres SERVIS — source, statut, campagne,
// programmation (`?schedule=`, le lien « voir dans le suivi » d'une programmation).
// Filtres et lignes déroulées vivent dans l'URL : retour navigateur et rechargement
// retrouvent la même lecture, et un filtre inconnu se dit ignoré. Aucun filtre n'est
// reconstruit côté client ; le serveur ne sert pas de filtre de date.
//
// Chaque source est une moitié exacte de la file : `batch` (une campagne), `scheduled` (une
// programmation), `manual` (un appel direct). Les deux dernières sont, ensemble, exactement
// les exécutions hors campagne (`fleet_id IS NULL` côté serveur).
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import RunnerJobList from '@/components/console/automations/RunnerJobList.vue'
import { ApiError } from '@/api'
import { listRunnerFleets, listRunnerTriggers, type RunnerFleet, type RunnerTrigger } from '@/api/console'
import { useAffichesUrl } from '@/composables/useAffichesUrl'
import {
  filtresExecutions, nomProgrammation, queryAvecFiltre, SOURCES_EXECUTION, STATUTS_EXECUTION, type ChampFiltre,
} from '@/lib/automationsEspace'
import { humanize } from '@/lib/errors'
import { nomCampagne } from '@/lib/runnerFleets'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { affiches, surAffiches } = useAffichesUrl()

const lecture = computed(() => filtresExecutions(route.query))
// Un filtre neuf remonte la liste : elle relit depuis le début, sous le nouveau filtre.
const cle = computed(() => JSON.stringify(lecture.value.valeur))

// Les campagnes nomment les options du filtre. Sans la bêta, le filtre n'est pas offert.
const campagnes = ref<RunnerFleet[]>([])
const campagnesErreur = ref<string | null>(null)
async function lireCampagnes() {
  try {
    campagnes.value = (await listRunnerFleets()).fleets
    campagnesErreur.value = null
  } catch (e) {
    campagnes.value = []
    campagnesErreur.value = e instanceof ApiError && e.status === 403 && e.code === 'beta_required'
      ? null : humanize(e)
  }
}
onMounted(lireCampagnes)

// Les programmations nomment les options de leur filtre (`runner.triggers`, ouvert à tout
// membre). Une lecture refusée retire le filtre de la liste, jamais celui de l'URL.
const programmations = ref<RunnerTrigger[]>([])
const programmationsErreur = ref<string | null>(null)
onMounted(async () => {
  try {
    programmations.value = (await listRunnerTriggers()).triggers
  } catch (e) {
    programmationsErreur.value = humanize(e)
  }
})

type Option = { value: string; label: string }
const optSources = computed<Option[]>(() =>
  SOURCES_EXECUTION.map((s) => ({ value: s, label: t(`automations.executions.source.${s}`) })))
const optStatuts = computed<Option[]>(() =>
  STATUTS_EXECUTION.map((s) => ({ value: s, label: t(`automations.jobs.status.${s}`) })))
const optCampagnes = computed<Option[]>(() => {
  const opts = campagnes.value.map((f) => ({ value: String(f.id), label: nomCampagne(f) }))
  const vise = lecture.value.valeur.fleet_id
  // Une campagne visée par l'URL reste nommée, même absente de la liste lue.
  if (vise !== undefined && !opts.some((o) => o.value === String(vise))) opts.unshift({ value: String(vise), label: `#${vise}` })
  return opts
})

const optProgrammations = computed<Option[]>(() => {
  const opts = programmations.value.map((p) => ({ value: String(p.id), label: nomProgrammation(p) }))
  const vise = lecture.value.valeur.trigger_id
  if (vise !== undefined && !opts.some((o) => o.value === String(vise))) opts.unshift({ value: String(vise), label: `#${vise}` })
  return opts
})

function changer(champ: ChampFiltre, valeur: string) {
  void router.push({ query: queryAvecFiltre(route.query, champ, valeur) })
}
</script>

<template>
  <div class="content-inner">
    <ConsoleCard :title="t('automations.executions.title')" :sub="t('automations.executions.sub')">
      <div class="card-body ex">
        <div class="ex-filtres" data-test="filtres">
          <OtoSelect :model-value="lecture.valeur.source ?? ''" :options="optSources" size="sm"
            :none-label="t('automations.executions.allSources')" :aria-label="t('automations.executions.sourceLabel')"
            @update:model-value="(v) => changer('source', v)" />
          <OtoSelect :model-value="lecture.valeur.status ?? ''" :options="optStatuts" size="sm"
            :none-label="t('automations.executions.allStatuses')" :aria-label="t('automations.executions.statusLabel')"
            @update:model-value="(v) => changer('status', v)" />
          <OtoSelect v-if="optCampagnes.length" :model-value="lecture.valeur.fleet_id ? String(lecture.valeur.fleet_id) : ''"
            :options="optCampagnes" size="sm" :none-label="t('automations.executions.allCampaigns')"
            :aria-label="t('automations.executions.campaignLabel')"
            @update:model-value="(v) => changer('campaign', v)" />
          <OtoSelect v-if="optProgrammations.length" data-test="filtre-programmation"
            :model-value="lecture.valeur.trigger_id ? String(lecture.valeur.trigger_id) : ''"
            :options="optProgrammations" size="sm" :none-label="t('automationsFilters.allSchedules')"
            :aria-label="t('automationsFilters.scheduleLabel')"
            @update:model-value="(v) => changer('schedule', v)" />
        </div>
        <p v-if="campagnesErreur" class="ex-err" role="alert">
          {{ t('automations.campaigns.error', { reason: campagnesErreur }) }}</p>
        <p v-if="programmationsErreur" class="ex-err" role="alert">
          {{ t('automationsFilters.schedulesError', { reason: programmationsErreur }) }}</p>
        <p v-if="lecture.ignores.length" class="ex-mute" data-test="ignores">
          {{ t('automations.space.ignoredFilter', { filters: lecture.ignores.join(', ') }) }}</p>
        <RunnerJobList :key="cle" :filtre="lecture.valeur" :affiches="affiches" @update:affiches="surAffiches" />
      </div>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.ex { display: flex; flex-direction: column; gap: 10px; }
.ex-filtres { display: flex; flex-wrap: wrap; gap: 8px; }
.ex-mute { margin: 0; font-size: 12.5px; color: var(--color-mute); }
.ex-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
