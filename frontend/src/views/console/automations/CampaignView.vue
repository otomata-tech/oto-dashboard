<script setup lang="ts">
// /automations/campaigns/:id — UNE campagne (oto#214) : ce qu'elle est (statut, procédure,
// tableau visé, modèle, en lecture), ses gestes existants, les compteurs de toute la
// campagne, et l'historique RÉEL de ses exécutions (`jobs op=list fleet_id=`, paginé par
// curseur ; ce qui a été déroulé est porté par l'URL).
//
// Deux lectures, et chacune garde son erreur :
//  • `fleets op=get` — ce qu'est la campagne, la lecture qui ouvre la page. `get` est dans la
//    liste blanche que la consultation en lecture seule laisse passer ;
//  • `fleets op=state` — les compteurs. ⚠️ `state` n'est PAS dans cette liste : en
//    consultation, le serveur la refuse (403 `view_as_read_only`), et seule la section des
//    compteurs le dit.
// Les deux rendent la flotte : la plus récemment DEMANDÉE fait foi, et la réponse d'un geste
// passe devant toute lecture partie avant elle (rangs de `useLectureParId`).
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import CampaignSummary from '@/components/console/automations/CampaignSummary.vue'
import ObjetAdresse from '@/components/console/automations/ObjetAdresse.vue'
import RunnerJobList from '@/components/console/automations/RunnerJobList.vue'
import { getRunnerFleet, type RunnerFleet } from '@/api/console'
import { useAffichesUrl } from '@/composables/useAffichesUrl'
import { useLectureCampagne } from '@/composables/useLectureCampagne'
import { useLectureParId } from '@/composables/useLectureParId'
import { historiqueDe } from '@/lib/automationsEspace'
import { estVivante, libelleCampagne, nomCampagne } from '@/lib/runnerFleets'

const emit = defineEmits<{ vivante: [oui: boolean] }>()
const { t } = useI18n()

const lecture = useLectureParId<RunnerFleet>(async (id) => (await getRunnerFleet(id)).fleet)
const { etat, erreur, lireEtat, surGeste } = useLectureCampagne({
  id: () => lecture.objet.value?.id ?? 0,
  ouverte: () => lecture.objet.value !== null,
  surFlotte: (fleet, rang) => { lecture.appliquer(rang, fleet) },
  rang: lecture.jeton,
})
const { affiches, surAffiches } = useAffichesUrl()

const libelle = computed(() => (lecture.objet.value ? libelleCampagne(lecture.objet.value, etat.value) : null))
const historique = computed(() => libelle.value?.cle.endsWith('.historical') ?? false)
const filtreHistorique = computed(() => (lecture.id.value === null ? null : historiqueDe('campagne', lecture.id.value)))

watch(() => (lecture.objet.value ? estVivante(lecture.objet.value) : false),
  (oui) => emit('vivante', oui), { immediate: true })
</script>

<template>
  <div class="content-inner">
    <ObjetAdresse :lecture="lecture" titre="automations.campaignPage.refused">
      <template #default="{ objet: fleet }">
        <ConsoleCard :title="nomCampagne(fleet)">
          <template #actions>
            <Tag v-if="libelle" :tone="libelle.ton" data-test="statut">{{ t(libelle.cle, libelle.params) }}</Tag>
          </template>
          <div class="card-body cp">
            <p v-if="historique" class="cp-mute">{{ t('automations.campaign.status.historicalHint') }}</p>
            <dl class="cp-dl" data-test="identite">
              <div>
                <dt>{{ t('automations.campaignPage.procedure') }}</dt>
                <dd>
                  <RouterLink v-if="fleet.procedure" :to="`/procedures/${encodeURIComponent(fleet.procedure)}`"
                    class="cp-lien">{{ fleet.procedure }}</RouterLink>
                  <template v-else>—</template>
                </dd>
              </div>
              <div>
                <dt>{{ t('automations.campaignPage.target') }}</dt>
                <dd class="cp-mono">{{ fleet.namespace ?? t('automations.campaignPage.noTarget') }}</dd>
              </div>
              <div v-if="fleet.row_filter">
                <dt>{{ t('automations.campaignPage.rowFilter') }}</dt>
                <dd class="cp-mono">{{ JSON.stringify(fleet.row_filter) }}</dd>
              </div>
              <div>
                <dt>{{ t('automations.campaignPage.model') }}</dt>
                <dd class="cp-mono">{{ fleet.model ?? t('automations.campaign.noModel') }}</dd>
              </div>
            </dl>
            <CampaignSummary :fleet="fleet" :etat="etat" :erreur="erreur" @flotte="surGeste" @relire="lireEtat" />
          </div>
        </ConsoleCard>

        <ConsoleCard v-if="filtreHistorique" :title="t('automations.campaignPage.history')"
          :sub="t('automations.campaignPage.historySub')">
          <div class="card-body" data-test="historique">
            <RunnerJobList :filtre="filtreHistorique" :affiches="affiches" @update:affiches="surAffiches" />
          </div>
        </ConsoleCard>
      </template>
    </ObjetAdresse>
  </div>
</template>

<style scoped>
.cp { display: flex; flex-direction: column; gap: 12px; }
.cp-dl { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0; }
.cp-dl div { display: flex; gap: 6px; align-items: baseline; }
.cp-dl dt { font-size: 11px; color: var(--color-faint); }
.cp-dl dd { margin: 0; font-size: 12.5px; color: var(--color-ink); word-break: break-word; }
.cp-mono { font-family: var(--font-mono, monospace); font-size: 11.5px; }
.cp-lien { font-weight: 600; color: var(--color-saffron-ink); }
.cp-lien:hover { color: var(--color-ink); }
.cp-mute { margin: 0; font-size: 12px; color: var(--color-mute); }
</style>
