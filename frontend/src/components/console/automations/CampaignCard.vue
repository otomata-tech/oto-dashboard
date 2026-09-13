<script setup lang="ts">
// UNE campagne dans la liste : son statut dit comme un fait, un lien vers sa page (oto#214),
// et — ouverte — son résumé (`CampaignSummary` : gestes, compteurs de TOUTE la campagne) et
// ses travaux.
//
// Fermée, la carte ne lit rien : `op=state` part à l'ouverture, puis à chaque
// rafraîchissement tant qu'elle reste ouverte (`useLectureCampagne`). Une erreur de lecture
// reste DANS la carte et s'efface à la lecture suivante réussie — elle ne remplace ni la
// liste ni les autres cartes.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'
import Tag from '../Tag.vue'
import CampaignSummary from './CampaignSummary.vue'
import RunnerJobList from './RunnerJobList.vue'
import type { RunnerFleet } from '@/api/console'
import { useLectureCampagne } from '@/composables/useLectureCampagne'
import { libelleCampagne, nomCampagne } from '@/lib/runnerFleets'

// La campagne affichée est celle de la LISTE (prop) : la carte ne garde pas sa propre
// copie. Ce qu'elle apprend du serveur — la flotte rendue par `op=state`, ou par un
// geste — remonte par `flotte`, et la liste la remplace. Un seul endroit tient le statut.
const props = defineProps<{ fleet: RunnerFleet; ouverteParDefaut: boolean }>()
const emit = defineEmits<{ flotte: [fleet: RunnerFleet] }>()
const { t } = useI18n()

const ouverte = ref(props.ouverteParDefaut)
const travaux = ref(false)
const { etat, erreur, lireEtat, surGeste } = useLectureCampagne({
  id: () => props.fleet.id,
  ouverte: () => ouverte.value,
  surFlotte: (f) => emit('flotte', f),
})

const libelle = computed(() => libelleCampagne(props.fleet, etat.value))
const historique = computed(() => libelle.value.cle.endsWith('.historical'))
</script>

<template>
  <li class="cc">
    <div class="cc-row">
      <button type="button" class="cc-head" :aria-expanded="ouverte" @click="ouverte = !ouverte">
        <span class="cc-name">{{ nomCampagne(fleet) }}</span>
        <Tag :tone="libelle.ton">{{ t(libelle.cle, libelle.params) }}</Tag>
        <span v-if="fleet.label && fleet.procedure" class="cc-meta">{{ fleet.procedure }}</span>
        <span v-if="fleet.namespace" class="cc-meta cc-mono">{{ fleet.namespace }}</span>
        <span class="cc-meta cc-mono">{{ fleet.model ?? t('automations.campaign.noModel') }}</span>
      </button>
      <RouterLink :to="`/automations/campaigns/${fleet.id}`" class="cc-open" data-test="page-campagne">
        {{ t('automations.campaigns.open') }}</RouterLink>
    </div>
    <p v-if="historique" class="cc-mute">{{ t('automations.campaign.status.historicalHint') }}</p>

    <div v-if="ouverte" class="cc-body">
      <CampaignSummary :fleet="fleet" :etat="etat" :erreur="erreur" @flotte="surGeste" @relire="lireEtat">
        <template #travaux>
          <div>
            <Btn kind="link" :aria-expanded="travaux" @click="travaux = !travaux">
              {{ travaux ? t('automations.campaign.hideJobs') : t('automations.campaign.showJobs') }}</Btn>
          </div>
          <RunnerJobList v-if="travaux" :filtre="{ fleet_id: fleet.id }" />
        </template>
      </CampaignSummary>
    </div>
  </li>
</template>

<style scoped>
.cc { border-bottom: 1px solid var(--color-hair); padding-bottom: 10px; }
.cc:last-child { border-bottom: 0; padding-bottom: 0; }
.cc-row { display: flex; align-items: center; gap: 10px; }
.cc-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex: 1; min-width: 0;
  background: none; border: 0; padding: 0; cursor: pointer; text-align: left; font: inherit;
  font-size: 12.5px;
}
.cc-name { font-weight: 600; font-size: 13.5px; color: var(--color-ink); }
.cc-meta { font-size: 11.5px; color: var(--color-mute); }
.cc-mono { font-family: var(--font-mono, monospace); font-size: 11px; }
.cc-open { flex: none; font-size: 12px; font-weight: 600; color: var(--color-saffron-ink); }
.cc-open:hover { color: var(--color-ink); }
.cc-body { margin-top: 10px; }
.cc-mute { margin: 4px 0 0; font-size: 12px; color: var(--color-mute); }
</style>
