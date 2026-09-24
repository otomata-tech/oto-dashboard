<script setup lang="ts">
// Les livraisons reçues par une programmation webhook (`triggers op=deliveries`), les plus
// récentes d'abord : ce que la source a envoyé, ce que la réception en a fait, et ce que le
// travail est devenu. Sans le corps reçu (`with_input`) : c'est une donnée de diagnostic,
// pas une donnée de suivi.
//
// ⚠️ Deux états, jamais confondus : `outcome` est FIGÉ à la réception (`queued` = acceptée,
// pas « encore en attente ») ; `job_status` est l'état ACTUEL du travail, relu à chaque
// lecture. Un refus garde son motif : c'est lui qui rend une source mal branchée réparable.
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Tag from '../Tag.vue'
import { listRunnerDeliveries, type RunnerDelivery } from '@/api/console'
import { absDate } from '@/lib/cellRender'
import { humanize } from '@/lib/errors'
import { libelleTravail, type Ton } from '@/lib/runnerJobs'

const props = defineProps<{ triggerId: number }>()
const { t } = useI18n()

const livraisons = ref<RunnerDelivery[] | null>(null)
const erreur = ref<string | null>(null)

onMounted(async () => {
  try {
    livraisons.value = (await listRunnerDeliveries(props.triggerId)).deliveries
  } catch (e) {
    erreur.value = humanize(e)
  }
})

const ISSUES: Record<string, Ton> = {
  queued: 'olive', delayed: 'saffron',
  refused_paused: 'terra', refused_secret: 'terra', refused_too_large: 'terra',
}
/** Le résultat de la réception. Un résultat que l'écran ne connaît pas se montre TEL QUEL. */
function issue(d: RunnerDelivery): { ton: Ton; texte: string } {
  const o = d.outcome ?? ''
  return o in ISSUES
    ? { ton: ISSUES[o]!, texte: t(`automationsWebhook.outcome.${o}`) }
    : { ton: 'saffron', texte: t('automationsWebhook.outcome.unknown', { outcome: o || '—' }) }
}
function travail(d: RunnerDelivery) {
  const l = libelleTravail(d.job_status)
  return { ton: l.ton, texte: t(l.cle, l.params) }
}
/** Le motif de la DERNIÈRE tentative échouée ; les précédentes se comptent. */
function dernierMotif(d: RunnerDelivery): string | null {
  const e = d.job_attempt_errors?.at(-1)?.error
  return typeof e === 'string' && e ? e : null
}
</script>

<template>
  <div class="wd" data-test="livraisons">
    <p v-if="erreur" class="wd-err" role="alert">{{ t('automationsWebhook.deliveries.error', { reason: erreur }) }}</p>
    <p v-else-if="livraisons === null" class="wd-mute">{{ t('common.loading') }}</p>
    <p v-else-if="!livraisons.length" class="wd-mute" data-test="aucune">{{ t('automationsWebhook.deliveries.empty') }}</p>
    <ul v-else class="wd-list">
      <li v-for="d in livraisons" :key="d.id" class="wd-item" data-test="livraison">
        <span class="wd-date">{{ d.received_at ? absDate(d.received_at) : '—' }}</span>
        <Tag :tone="issue(d).ton">{{ issue(d).texte }}</Tag>
        <template v-if="d.job_id != null">
          <RouterLink :to="`/automations/executions/${d.job_id}`" class="wd-lien">
            {{ t('automationsWebhook.deliveries.execution', { id: d.job_id }) }}</RouterLink>
          <Tag v-if="d.job_status" :tone="travail(d).ton">{{ travail(d).texte }}</Tag>
          <span v-if="d.outcome === 'delayed' && d.job_due_at && d.job_status === 'pending'" class="wd-mute">
            {{ t('automationsWebhook.deliveries.dueAt', { date: absDate(d.job_due_at!) }) }}</span>
        </template>
        <span v-if="d.job_attempt_errors?.length" class="wd-fail">
          {{ t('automationsWebhook.deliveries.attempts', d.job_attempt_errors.length) }}<template
            v-if="dernierMotif(d)"> — {{ dernierMotif(d) }}</template></span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wd { display: flex; flex-direction: column; gap: 8px; }
.wd-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wd-item { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px; }
.wd-date { font-size: 11.5px; color: var(--color-mute); min-width: 9rem; }
.wd-lien { font-weight: 600; color: var(--color-saffron-ink); }
.wd-lien:hover { color: var(--color-ink); }
.wd-mute { margin: 0; font-size: 11.5px; color: var(--color-mute); }
.wd-fail { font-size: 11.5px; color: var(--color-terra-ink); flex-basis: 100%; }
.wd-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
