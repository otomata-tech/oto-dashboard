<script setup lang="ts">
// Une liste PAGINÉE de travaux, sous un filtre SERVEUR : ceux d'une campagne
// (`fleet_id`), ou ceux d'une source hors campagne (`scheduled`, `manual`).
//
// ⚠️ `total` est celui du serveur, sous le même filtre : il ne dépend ni de la page
// ni du curseur. On n'additionne jamais les lignes chargées pour en faire un total —
// c'est exactement ce que faisait la fenêtre des 120 derniers travaux.
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'
import Tag from '../Tag.vue'
import { listRunnerJobs, type RunnerJob, type RunnerJobsFiltre } from '@/api/console'
import { inscrireRafraichissement, useMaintenant } from '@/composables/useRafraichissement'
import { absDate } from '@/lib/cellRender'
import { humanize } from '@/lib/errors'
import {
  bailExpire, coutTravail, estConclu, jetons, libelleTravail, procOf, sejour,
} from '@/lib/runnerJobs'

const props = defineProps<{ filtre: RunnerJobsFiltre }>()
const emit = defineEmits<{ ouvrir: [job: RunnerJob] }>()
const { t } = useI18n()
const maintenant = useMaintenant()

export type { RunnerJobsFiltre }
const PAGE = 25

const jobs = ref<RunnerJob[]>([])
const total = ref<number | null>(null)
const suite = ref<string | null>(null)
const loaded = ref(false)
const error = ref<string | null>(null)
const plus = ref(false)

/** Relit depuis le début AUTANT de lignes qu'il y en a d'affichées : un
 * rafraîchissement ne replie pas ce que la personne a déroulé. Le serveur écrête une
 * demande trop grande et rend alors un curseur — rien ne se perd. */
async function charger() {
  try {
    const page = await listRunnerJobs(props.filtre, { limit: Math.max(PAGE, jobs.value.length) })
    jobs.value = page.jobs
    total.value = page.total
    suite.value = page.next_cursor
    error.value = null
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
  }
}

async function chargerSuite() {
  if (!suite.value) return
  plus.value = true
  try {
    const page = await listRunnerJobs(props.filtre, { limit: PAGE, cursor: suite.value })
    jobs.value = [...jobs.value, ...page.jobs]
    total.value = page.total
    suite.value = page.next_cursor
    error.value = null
  } catch (e) {
    error.value = humanize(e)
  } finally {
    plus.value = false
  }
}

function statut(j: RunnerJob) {
  const l = libelleTravail(j.status)
  return { ton: l.ton, texte: t(l.cle, l.params) }
}

/** Le coût, ou « coût inconnu » sur un travail conclu qui n'en déclare pas — jamais 0.
 * Sur un travail en file ou en vol, rien : il est inconnu par nature. */
function cout(j: RunnerJob): string | null {
  const c = coutTravail(j)
  if (c.etat === 'connu') return t('automations.jobs.tokens', { n: jetons(c.jetons) ?? '0' })
  return estConclu(j) ? t('automations.jobs.costUnknown') : null
}

onMounted(charger)
inscrireRafraichissement(charger)
</script>

<template>
  <div class="jl">
    <p v-if="error" class="jl-err" role="alert">{{ t('automations.jobs.error', { reason: error }) }}</p>
    <p v-if="!loaded" class="jl-mute">{{ t('common.loading') }}</p>
    <p v-else-if="!jobs.length && !error" class="jl-mute">{{ t('automations.jobs.empty') }}</p>

    <ul v-if="jobs.length" class="jl-list">
      <li v-for="jb in jobs" :key="jb.id" class="jl-item">
        <span class="jl-id">#{{ jb.id }}</span>
        <Tag :tone="statut(jb).ton">{{ statut(jb).texte }}</Tag>
        <span v-if="props.filtre.fleet_id === undefined && procOf(jb)" class="jl-proc">{{ procOf(jb) }}</span>
        <span v-if="jb.status === 'expired'" class="jl-mute">{{ t('automations.jobs.expiredHint') }}</span>
        <span v-if="bailExpire(jb, maintenant)" class="jl-warn">{{ t('automations.jobs.leaseExpired') }}</span>
        <span v-if="sejour(jb, maintenant)" class="jl-mono">{{ sejour(jb, maintenant) }}</span>
        <span v-if="cout(jb)" class="jl-mono">{{ cout(jb) }}</span>
        <span class="jl-date">{{ absDate(String(jb.finished_at ?? jb.created_at ?? '')) }}</span>
        <button type="button" class="jl-open" @click="emit('ouvrir', jb)">{{ t('automations.jobs.open') }}</button>
      </li>
    </ul>

    <div v-if="jobs.length" class="jl-foot">
      <span>{{ t('automations.jobs.shown', { shown: jobs.length, total: total ?? '—' }) }}</span>
      <Btn v-if="suite" kind="mini" :disabled="plus" @click="chargerSuite">
        {{ t('automations.jobs.more') }}</Btn>
    </div>
  </div>
</template>

<style scoped>
.jl { display: flex; flex-direction: column; gap: 8px; }
.jl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.jl-item {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 6px 10px;
}
.jl-id, .jl-mono { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-mute); }
.jl-proc { font-size: 12px; color: var(--color-ink); }
.jl-warn { font-size: 11.5px; color: var(--color-terra-ink); }
.jl-date { font-size: 11px; color: var(--color-faint); margin-left: auto; }
.jl-open {
  font: inherit; font-size: 12px; border: 0; background: none; cursor: pointer; padding: 0;
  color: var(--color-saffron-ink); font-weight: 600;
}
.jl-open:hover { color: var(--color-ink); }
.jl-foot { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--color-mute); }
.jl-mute { margin: 0; font-size: 12.5px; color: var(--color-mute); }
.jl-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
