<script setup lang="ts">
// /automations — l'onglet « Automatisations » de l'espace (oto#214) : ce qui tourne et ce qui
// demande un regard, puis la liste de TOUTES les automatisations de l'org (programmations et
// campagnes, `AutomationsList`), puis les routines Claude Code. Programmations (avec la
// présence du runner) et campagnes sont lues ici, une fois, et partagées par les sections.
//
// L'ancien `?run=<run>` — les liens d'une ligne de tableau (`DatastoreQueueBar`, `RowDrawer`)
// — mène à la page de l'exécution quand il se résout (`useCibleRun`) ; sinon l'entrée dit
// pourquoi, comme avant.
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Notice from '@/components/console/Notice.vue'
import AutomationsList from '@/components/console/automations/AutomationsList.vue'
import RoutinesSection from '@/components/console/automations/RoutinesSection.vue'
import RunnerPresenceBanner from '@/components/console/automations/RunnerPresenceBanner.vue'
import WatchSection from '@/components/console/automations/WatchSection.vue'
import { useCampagnes } from '@/composables/useCampagnes'
import { useCibleRun } from '@/composables/useCibleRun'
import { useProgrammations } from '@/composables/useProgrammations'
import { estVivante } from '@/lib/runnerFleets'

const emit = defineEmits<{ vivante: [oui: boolean] }>()
const { t } = useI18n()
const router = useRouter()

const { triggers, runner, loaded, error } = useProgrammations()
const { campagnes } = useCampagnes()
// Une campagne vivante fait tourner l'intervalle de rafraîchissement de l'espace.
watch(() => campagnes.fleets.some(estVivante), (oui) => emit('vivante', oui), { immediate: true })

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

    <WatchSection :triggers="triggers" :triggers-lus="loaded" :triggers-erreur="error" :campagnes="campagnes" />
    <AutomationsList :triggers="triggers" :triggers-lus="loaded" :triggers-erreur="error" :campagnes="campagnes" />
    <RoutinesSection />
  </div>
</template>
