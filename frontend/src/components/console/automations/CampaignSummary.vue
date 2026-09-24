<script setup lang="ts">
// Ce qu'on sait d'UNE campagne ouverte (oto#205) — ses gestes, l'alerte « armée sans premier
// travail », et les compteurs de TOUTE la campagne (`op=state`), jamais ceux d'une fenêtre de
// travaux. Monté sur la fiche d'une campagne, qui lit l'état par `useLectureCampagne` (la
// carte de l'ancienne liste des campagnes est partie le 24/09/2026).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Notice from '../Notice.vue'
import CampaignActions from './CampaignActions.vue'
import type { RunnerFleet, RunnerFleetState } from '@/api/console'
import { useMaintenant } from '@/composables/useRafraichissement'
import { absDate } from '@/lib/cellRender'
import { armeeSansTravail, compteurs, jetons } from '@/lib/runnerFleets'
import { duree } from '@/lib/runnerJobs'

const props = defineProps<{ fleet: RunnerFleet; etat: RunnerFleetState | null; erreur: string | null }>()
const emit = defineEmits<{ flotte: [fleet: RunnerFleet]; relire: [] }>()
const { t } = useI18n()
const maintenant = useMaintenant()

const sansTravailDepuis = computed(() => armeeSansTravail(props.fleet, maintenant.value))

/** ⚠️ Le serveur somme `usage_tokens` avec un repli à 0 : sur une campagne dont AUCUN
 * travail n'est conclu, aucun résultat n'existe encore, et ce 0 serait un coût
 * inventé. On le dit inconnu. Dès qu'un travail est conclu, le nombre servi fait foi. */
const jetonsCampagne = computed(() => {
  const e = props.etat
  if (!e) return null
  if (!(e.done ?? 0) && !(e.failed ?? 0)) return null
  return jetons(e.usage_tokens)
})
</script>

<template>
  <div class="csum">
    <CampaignActions :fleet="fleet" :etat="etat" @flotte="(f) => emit('flotte', f)" @relire="emit('relire')" />
    <Notice v-if="sansTravailDepuis !== null" tone="warn">
      {{ t('automations.campaign.armedIdle', { duration: duree(sansTravailDepuis) }) }}
    </Notice>
    <p v-if="erreur" class="csum-err" role="alert">
      {{ t('automations.campaign.error', { reason: erreur }) }}</p>
    <p v-if="!etat && !erreur" class="csum-mute">{{ t('automations.campaign.loading') }}</p>
    <p v-else-if="etat?.no_jobs_attached" class="csum-mute">{{ t('automations.campaign.noJobs') }}</p>
    <template v-else-if="etat">
      <dl class="csum-dl" data-test="compteurs">
        <div v-for="c in compteurs(etat)" :key="c.cle" :class="{ alerte: c.alerte }">
          <dt>{{ t(`automations.campaign.counters.${c.cle}`) }}</dt><dd>{{ c.n ?? '—' }}</dd>
        </div>
        <div><dt>{{ t('automations.campaign.counters.total') }}</dt><dd>{{ etat.jobs_total }}</dd></div>
      </dl>
      <dl class="csum-dl">
        <div>
          <dt>{{ t('automations.campaign.tokens') }}</dt>
          <dd>{{ jetonsCampagne ?? t('automations.campaign.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('automations.campaign.heaviest') }}</dt>
          <dd>{{ jetons(etat.heaviest_row_tokens) ?? t('automations.campaign.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('automations.campaign.lastFinished') }}</dt>
          <dd>{{ etat.last_finished ? absDate(etat.last_finished) : t('automations.campaign.none') }}</dd>
        </div>
      </dl>
    </template>
  </div>
</template>

<style scoped>
.csum { display: flex; flex-direction: column; gap: 10px; }
.csum-dl { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0; }
.csum-dl div { display: flex; gap: 6px; align-items: baseline; }
.csum-dl dt { font-size: 11px; color: var(--color-faint); }
.csum-dl dd { margin: 0; font-size: 12.5px; font-weight: 600; color: var(--color-ink); }
.csum-dl .alerte dd { color: var(--color-terra-ink); }
.csum-mute { margin: 4px 0 0; font-size: 12px; color: var(--color-mute); }
.csum-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
