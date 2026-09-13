<script setup lang="ts">
// Une liste PAGINÉE de travaux, sous un filtre SERVEUR : ceux d'une campagne
// (`fleet_id`), d'une programmation (`trigger_id`), d'une source ou d'un statut.
// Chaque ligne mène à la page de son exécution (oto#214).
//
// ⚠️ `total` est celui du serveur, sous le même filtre : il ne dépend ni de la page
// ni du curseur. On n'additionne jamais les lignes chargées pour en faire un total —
// c'est exactement ce que faisait la fenêtre des 120 derniers travaux.
//
// Ce qui a été déroulé peut vivre dans l'URL (oto#214) : `affiches` dit combien de lignes
// relire au montage — rechargement et retour navigateur retrouvent la même liste — et
// `update:affiches` remonte chaque « Afficher la suite ».
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'
import Tag from '../Tag.vue'
import { listRunnerJobs, type RunnerJob, type RunnerJobsFiltre, type RunnerJobsPage } from '@/api/console'
import { inscrireRafraichissement, useMaintenant } from '@/composables/useRafraichissement'
import { TAILLE_PAGE } from '@/lib/automationsEspace'
import { absDate } from '@/lib/cellRender'
import { humanize } from '@/lib/errors'
import {
  bailExpire, coutTravail, estConclu, jetons, libelleTravail, procOf, sejour,
} from '@/lib/runnerJobs'

const props = withDefaults(defineProps<{
  filtre: RunnerJobsFiltre
  taille?: number
  affiches?: number | null
}>(), { taille: TAILLE_PAGE, affiches: null })
const emit = defineEmits<{ 'update:affiches': [n: number] }>()
const { t } = useI18n()
const maintenant = useMaintenant()

export type { RunnerJobsFiltre }
/** Le plus que le serveur rend en une page (`JOBS_PAGE_MAX`) : au-delà, il écrête et rend
 * un curseur. */
const PAGE_MAX = 200

const jobs = ref<RunnerJob[]>([])
const total = ref<number | null>(null)
const suite = ref<string | null>(null)
const loaded = ref(false)
const error = ref<string | null>(null)
const plus = ref(false)

/** Relit depuis le début jusqu'à `cible` lignes, page par page tant que le serveur rend des
 * pages PLEINES. Un rafraîchissement ne replie donc pas ce qui a été déroulé, et un retour
 * navigateur retrouve ce que l'URL dit avoir affiché. */
async function lireJusqua(cible: number) {
  const lus: RunnerJob[] = []
  let curseur: string | null = null
  let page: RunnerJobsPage
  do {
    const limit = Math.min(cible - lus.length, PAGE_MAX)
    page = await listRunnerJobs(props.filtre, curseur ? { limit, cursor: curseur } : { limit })
    lus.push(...page.jobs)
    curseur = page.next_cursor
    if (page.jobs.length < limit) break
  } while (lus.length < cible && curseur)
  jobs.value = lus
  total.value = page.total
  suite.value = page.next_cursor
}

async function charger() {
  try {
    await lireJusqua(Math.max(props.taille, props.affiches ?? 0, jobs.value.length))
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
    const page = await listRunnerJobs(props.filtre, { limit: props.taille, cursor: suite.value })
    jobs.value = [...jobs.value, ...page.jobs]
    total.value = page.total
    suite.value = page.next_cursor
    error.value = null
    emit('update:affiches', jobs.value.length)
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

/** La procédure se dit sur une liste qui en mélange plusieurs, pas sous le filtre d'un objet. */
const unObjet = () => props.filtre.fleet_id !== undefined || props.filtre.trigger_id !== undefined

onMounted(charger)
inscrireRafraichissement(charger)
</script>

<template>
  <div class="jl">
    <p v-if="error" class="jl-err" role="alert">{{ t('automations.jobs.error', { reason: error }) }}</p>
    <p v-if="!loaded" class="jl-mute">{{ t('common.loading') }}</p>
    <p v-else-if="!jobs.length && !error" class="jl-mute">{{ t('automations.jobs.empty') }}</p>

    <ul v-if="jobs.length" class="jl-list">
      <li v-for="jb in jobs" :key="jb.id" class="jl-item" :data-job="jb.id">
        <span class="jl-id">#{{ jb.id }}</span>
        <Tag :tone="statut(jb).ton">{{ statut(jb).texte }}</Tag>
        <span v-if="!unObjet() && procOf(jb)" class="jl-proc">{{ procOf(jb) }}</span>
        <span v-if="jb.status === 'expired'" class="jl-mute">{{ t('automations.jobs.expiredHint') }}</span>
        <span v-if="bailExpire(jb, maintenant)" class="jl-warn">{{ t('automations.jobs.leaseExpired') }}</span>
        <span v-if="sejour(jb, maintenant)" class="jl-mono">{{ sejour(jb, maintenant) }}</span>
        <span v-if="cout(jb)" class="jl-mono">{{ cout(jb) }}</span>
        <span class="jl-date">{{ absDate(String(jb.finished_at ?? jb.created_at ?? '')) }}</span>
        <RouterLink :to="`/automations/executions/${jb.id}`" class="jl-open">{{ t('automations.jobs.open') }}</RouterLink>
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
.jl-open { font-size: 12px; font-weight: 600; color: var(--color-saffron-ink); }
.jl-open:hover { color: var(--color-ink); }
.jl-foot { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--color-mute); }
.jl-mute { margin: 0; font-size: 12.5px; color: var(--color-mute); }
.jl-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
