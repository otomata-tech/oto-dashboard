<script setup lang="ts">
// « À surveiller », sur l'entrée de l'espace Automatisations (oto#214) : ce qui tourne et ce
// qui demande un regard, sans descendre dans une page.
//   • les campagnes VIVANTES (`fleets op=list`), et celles armées sans premier travail ;
//   • les programmations qui perdent des occurrences (lues avec la présence du runner, par
//     la page : `triggers op=list`) ;
//   • les dernières exécutions en échec (`jobs op=list status=failed`, total servi).
// Chaque bloc lit son propre contrat et garde son erreur.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '../ConsoleCard.vue'
import Tag from '../Tag.vue'
import RunnerJobList from './RunnerJobList.vue'
import { ApiError } from '@/api'
import { listRunnerFleets, type RunnerFleet, type RunnerJobsFiltre, type RunnerTrigger } from '@/api/console'
import { inscrireRafraichissement, useMaintenant } from '@/composables/useRafraichissement'
import { nomProgrammation } from '@/lib/automationsEspace'
import { absDate } from '@/lib/cellRender'
import { humanize } from '@/lib/errors'
import { armeeSansTravail, estVivante, libelleCampagne, nomCampagne } from '@/lib/runnerFleets'
import { duree } from '@/lib/runnerJobs'

const props = defineProps<{ triggers: RunnerTrigger[]; triggersLus: boolean; triggersErreur: string | null }>()
const emit = defineEmits<{ vivante: [oui: boolean] }>()
const { t } = useI18n()
const maintenant = useMaintenant()

const fleets = ref<RunnerFleet[]>([])
const lu = ref(false)
const erreur = ref<string | null>(null)
const betaAbsente = ref(false)

let demande = 0
async function charger() {
  const n = ++demande
  try {
    const res = await listRunnerFleets()
    if (n !== demande) return
    fleets.value = res.fleets
    erreur.value = null
    betaAbsente.value = false
  } catch (e) {
    if (n !== demande) return
    if (e instanceof ApiError && e.status === 403 && e.code === 'beta_required') {
      betaAbsente.value = true
      fleets.value = []
      erreur.value = null
    } else {
      erreur.value = humanize(e)
    }
  } finally {
    lu.value = true
  }
}

const vivantes = computed(() => fleets.value.filter(estVivante))
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

watch(() => vivantes.value.length > 0, (oui) => emit('vivante', oui), { immediate: true })
onMounted(charger)
inscrireRafraichissement(charger)
</script>

<template>
  <ConsoleCard :title="t('automations.watch.title')" :sub="t('automations.watch.sub')">
    <div class="card-body ws">
      <section class="ws-bloc" data-test="vivantes">
        <h4 class="ws-t">{{ t('automations.watch.live') }}</h4>
        <p v-if="betaAbsente" class="ws-mute" data-test="beta">{{ t('automations.campaigns.betaOff') }}</p>
        <template v-else>
          <p v-if="erreur" class="ws-err" role="alert">{{ t('automations.campaigns.error', { reason: erreur }) }}</p>
          <p v-if="!lu" class="ws-mute">{{ t('common.loading') }}</p>
          <p v-else-if="!vivantes.length && !erreur" class="ws-mute">{{ t('automations.watch.liveEmpty') }}</p>
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
