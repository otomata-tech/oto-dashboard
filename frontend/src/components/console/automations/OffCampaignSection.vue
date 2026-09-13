<script setup lang="ts">
// Les travaux HORS CAMPAGNE (`fleet_id` nul) : ce que partent les déclencheurs, et les
// appels directs. Repliée par défaut — on vient ici pour les campagnes.
//
// ⚠️ Le contrat n'a pas de filtre « sans campagne » d'un seul mot. Il sert `source` :
// `scheduled` (déclencheur) et `manual` (appel direct) sont, côté serveur, exactement
// les deux moitiés de `fleet_id IS NULL`. Deux listes, deux totaux vrais — plutôt
// qu'un filtre reconstruit sur une fenêtre de travaux chargés.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'
import ConsoleCard from '../ConsoleCard.vue'
import RunnerJobList from './RunnerJobList.vue'
import type { RunnerJob, RunnerJobsFiltre } from '@/api/console'

const emit = defineEmits<{ ouvrir: [job: RunnerJob] }>()
const { t } = useI18n()

const ouverte = ref(false)
const PROGRAMMES: RunnerJobsFiltre = { source: 'scheduled' }
const DIRECTS: RunnerJobsFiltre = { source: 'manual' }
</script>

<template>
  <ConsoleCard :title="t('automations.offCampaign.title')" :sub="t('automations.offCampaign.sub')">
    <template #actions>
      <Btn kind="mini" :aria-expanded="ouverte" @click="ouverte = !ouverte">
        {{ ouverte ? t('automations.offCampaign.hide') : t('automations.offCampaign.show') }}</Btn>
    </template>
    <div v-if="ouverte" class="card-body oc">
      <h4 class="oc-t">{{ t('automations.offCampaign.scheduled') }}</h4>
      <RunnerJobList :filtre="PROGRAMMES" @ouvrir="(j) => emit('ouvrir', j)" />
      <h4 class="oc-t">{{ t('automations.offCampaign.manual') }}</h4>
      <RunnerJobList :filtre="DIRECTS" @ouvrir="(j) => emit('ouvrir', j)" />
    </div>
  </ConsoleCard>
</template>

<style scoped>
.oc { display: flex; flex-direction: column; gap: 8px; }
.oc-t { margin: 6px 0 0; font-size: 12px; font-weight: 700; color: var(--color-ink); }
</style>
