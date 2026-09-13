<script setup lang="ts">
// /automations — l'ENTRÉE de l'espace Automatisations (oto#214) : ce qui tourne et ce qui
// demande un regard, sans descendre dans une page. Le runner (sa présence arrive avec les
// programmations, en UNE lecture), « à surveiller », et les routines Claude Code.
//
// L'ancien `?run=<run>` — les liens d'une ligne de tableau (`DatastoreQueueBar`, `RowDrawer`)
// — mène à la page de l'exécution quand il se résout (`useCibleRun`) ; sinon l'entrée dit
// pourquoi, comme avant.
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Notice from '@/components/console/Notice.vue'
import RoutinesSection from '@/components/console/automations/RoutinesSection.vue'
import RunnerPresenceBanner from '@/components/console/automations/RunnerPresenceBanner.vue'
import WatchSection from '@/components/console/automations/WatchSection.vue'
import { useCibleRun } from '@/composables/useCibleRun'
import { useProgrammations } from '@/composables/useProgrammations'

const emit = defineEmits<{ vivante: [oui: boolean] }>()
const { t } = useI18n()
const router = useRouter()

const { triggers, runner, loaded, error } = useProgrammations()
const { cible } = useCibleRun((job) => { void router.replace(`/automations/executions/${job.id}`) })
</script>

<template>
  <div class="content-inner">
    <RunnerPresenceBanner :runner="runner" :loaded="loaded" :error="error" />

    <Notice v-if="cible" tone="info" data-test="cible-run">
      <template v-if="cible.etat === 'absent'">{{ t('automations.run.absent', { run: cible.run }) }}</template>
      <template v-else-if="cible.etat === 'hors-page'">
        {{ t('automations.run.horsPage', { run: cible.run, n: cible.lus }) }}</template>
      <template v-else>{{ t('automations.run.erreur', { run: cible.run, reason: cible.raison }) }}</template>
    </Notice>

    <WatchSection :triggers="triggers" :triggers-lus="loaded" :triggers-erreur="error"
      @vivante="(oui) => emit('vivante', oui)" />
    <RoutinesSection />
  </div>
</template>
