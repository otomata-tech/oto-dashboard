<script setup lang="ts">
// /automations/executions/:id — UNE exécution (oto#214) : la fiche des lots 1 et 2
// (`RunnerJobDetail`), lue par son identifiant (`jobs op=get`, lecture org-scopée) —
// rechargeable et partageable. Elle mène à sa campagne ou à sa programmation quand elle en
// vient : `fleet_id` pour l'une, `trigger_id` posé dans la charge utile pour l'autre.
import { useI18n } from 'vue-i18n'
import RunnerJobDetail from '@/components/console/RunnerJobDetail.vue'
import ObjetAdresse from '@/components/console/automations/ObjetAdresse.vue'
import { getRunnerJob, type RunnerJob } from '@/api/console'
import { useLectureParId } from '@/composables/useLectureParId'
import { programmationDe } from '@/lib/automationsEspace'

const { t } = useI18n()
const lecture = useLectureParId<RunnerJob>(async (id) => (await getRunnerJob(id)).job)
</script>

<template>
  <div class="content-inner">
    <ObjetAdresse :lecture="lecture" titre="automations.executionPage.refused">
      <template #default="{ objet: job }">
        <p v-if="job.fleet_id || programmationDe(job) !== null" class="xv-liens" data-test="provenance">
          <RouterLink v-if="job.fleet_id" :to="`/automations/campaigns/${job.fleet_id}`" class="xv-lien">
            {{ t('automations.executionPage.campaign', { id: job.fleet_id }) }}</RouterLink>
          <RouterLink v-if="programmationDe(job) !== null" :to="`/automations/schedules/${programmationDe(job)}`"
            class="xv-lien">{{ t('automations.executionPage.schedule', { id: programmationDe(job) ?? '' }) }}</RouterLink>
        </p>
        <RunnerJobDetail :job="job" />
      </template>
    </ObjetAdresse>
  </div>
</template>

<style scoped>
.xv-liens { margin: 0; display: flex; flex-wrap: wrap; gap: 14px; }
.xv-lien { font-size: 12.5px; font-weight: 600; color: var(--color-saffron-ink); }
.xv-lien:hover { color: var(--color-ink); }
</style>
