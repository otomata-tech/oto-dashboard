<script setup lang="ts">
// Les GESTES d'une campagne (oto#205, lot 2) : armer, relancer, arrêter.
//
// Qui voit quoi (`gestesCampagne`, lib/runnerGestes) : Armer et Relancer ne s'affichent
// qu'à un administrateur de l'org — jamais grisés pour un membre ; Arrêter est ouvert à
// tout membre ; en consultation en lecture seule, rien. Un 403 servi s'affiche quand même.
//
// Le témoin est une RELECTURE (`useGesteObserve`) : la réponse d'un geste est un fait
// écrit par le serveur (`armed`, `stopping`), remonté tel quel à la liste ; « en cours »
// et « arrêtée » ne s'affichent que lorsqu'une relecture de `op=state` les sert.
// Aucun geste ne touche la cible, le modèle, `workers` ni le plafond ; le motif d'arrêt
// n'est pas saisi (le défaut du serveur s'applique).
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'
import Notice from '../Notice.vue'
import ConfirmerSurPlace from './ConfirmerSurPlace.vue'
import RefusServi from './RefusServi.vue'
import { launchRunnerFleet, stopRunnerFleet, type RunnerFleet, type RunnerFleetState } from '@/api/console'
import { useGesteObserve } from '@/composables/useGesteObserve'
import { useMaintenant } from '@/composables/useRafraichissement'
import { useMe } from '@/composables/useMe'
import { droits, FENETRE_OBSERVATION_MS, gestesCampagne, type GesteCampagne } from '@/lib/runnerGestes'
import { duree, instant } from '@/lib/runnerJobs'

const props = defineProps<{ fleet: RunnerFleet; etat: RunnerFleetState | null }>()
const emit = defineEmits<{ flotte: [fleet: RunnerFleet]; relire: [] }>()
const { t } = useI18n()
const { me } = useMe()
const maintenant = useMaintenant()

const permis = computed(() => gestesCampagne(props.fleet, props.etat, droits(me.value)))
const nom = computed(() => props.fleet.label || props.fleet.procedure || `#${props.fleet.id}`)

const { phase, geste, refus, demander, annuler, confirmer } = useGesteObserve<GesteCampagne>({
  envoyer: async (g) => {
    const { fleet } = g === 'arreter'
      ? await stopRunnerFleet(props.fleet.id)
      : await launchRunnerFleet(props.fleet.id)
    emit('flotte', fleet)
  },
  relire: () => emit('relire'),
  fenetreMs: (g) => FENETRE_OBSERVATION_MS[g],
})

// Une confirmation ouverte sur un geste que l'état servi ne permet plus (une relecture a
// changé le statut entre-temps) se referme : la confirmer enverrait un geste périmé.
watch(permis, (p) => {
  if (phase.value === 'confirmation' && geste.value && !p.gestes.includes(geste.value)) annuler()
})

const LIBELLE: Record<GesteCampagne, string> = { armer: 'arm', relancer: 'relaunch', arreter: 'stop' }
const CONFIRMATION: Record<GesteCampagne, string> = {
  armer: 'confirmArm', relancer: 'confirmRelaunch', arreter: 'confirmStop',
}
const EMPECHEMENT = {
  historique: 'historical', borneAtteinte: 'boundReached', echecsConsecutifs: 'consecutiveFailures',
} as const

/** Depuis quand l'arrêt est demandé. `null` sans date lisible : on ne l'invente pas. */
const arretDepuis = computed(() => {
  if (props.fleet.status !== 'stopping') return null
  const ts = instant(props.fleet.stopping_at)
  return ts === null ? null : Math.max(0, maintenant.value - ts)
})
const enConfirmation = computed(() => phase.value === 'confirmation' || phase.value === 'envoi')
const visible = computed(() => props.fleet.status === 'stopping' || enConfirmation.value
  || permis.value.gestes.length > 0 || permis.value.empechement !== null || refus.value !== null)
</script>

<template>
  <div v-if="visible" class="ca" data-test="gestes">
    <Notice v-if="fleet.status === 'stopping'" tone="warn">
      <template v-if="arretDepuis !== null">
        {{ t('automations.actions.stoppingSince', { duration: duree(arretDepuis) }) }}</template>
      <template v-else>{{ t('automations.actions.stoppingNoDate') }}</template>
    </Notice>

    <ConfirmerSurPlace v-if="enConfirmation && geste"
      :message="t(`automations.actions.${CONFIRMATION[geste]}`, { label: nom })"
      :action="t(`automations.actions.${LIBELLE[geste]}`)"
      :busy="phase === 'envoi'"
      @confirmer="confirmer" @annuler="annuler" />
    <div v-else-if="permis.gestes.length" class="ca-row">
      <Btn v-for="g in permis.gestes" :key="g" kind="mini" :data-test="`geste-${g}`" @click="demander(g)">
        {{ t(`automations.actions.${LIBELLE[g]}`) }}</Btn>
    </div>

    <p v-if="permis.empechement" class="ca-mute" data-test="empechement">
      {{ t(`automations.actions.blocked.${EMPECHEMENT[permis.empechement]}`,
           { n: etat?.jobs_total ?? 0, max: fleet.max_rows ?? 0 }) }}</p>
    <RefusServi v-if="refus" :refus="refus" />
  </div>
</template>

<style scoped>
.ca { display: flex; flex-direction: column; gap: 8px; }
.ca-row { display: flex; flex-wrap: wrap; gap: 8px; }
.ca-mute { margin: 0; font-size: 12px; line-height: 1.5; color: var(--color-mute); text-wrap: pretty; }
</style>
