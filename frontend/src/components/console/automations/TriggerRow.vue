<script setup lang="ts">
// UN déclencheur : quelle procédure part quand, sur quel modèle, ce qu'il a perdu — et ses
// gestes : l'interrupteur, « Régler » (formulaire en ligne), « Supprimer » (confirmé sur
// place). Extrait de `RunnerTriggersCard` (oto#205, lot 2).
//
// Les droits reflètent le serveur TEL QU'IL EST SERVI : `runner.triggers` est ouvert à tout
// membre, sans garde admin ni bêta, et l'écran n'en ajoute aucune. `gestes` est faux en
// consultation en lecture seule, où le serveur refuse toute mutation.
//
// Après un réglage ou un interrupteur, la réponse fait foi (`next_due` recalculé par le
// serveur), puis la carte relit la liste : la ligne rendue n'a ni `expired_*` ni `runner`.
// Une suppression ne retire la ligne que sur `ok: true`.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'
import Tag from '../Tag.vue'
import Toggle from '../Toggle.vue'
import ConfirmerSurPlace from './ConfirmerSurPlace.vue'
import RefusServi from './RefusServi.vue'
import TriggerSettingsForm from './TriggerSettingsForm.vue'
import { deleteRunnerTrigger, updateRunnerTrigger, type RunnerTrigger } from '@/api/console'
import { useGesteObserve } from '@/composables/useGesteObserve'
import { cadenceEnMots } from '@/lib/cadence'
import { absDate } from '@/lib/cellRender'
import { apresReglage, modeleDeclencheur, refusServi, type Refus } from '@/lib/runnerGestes'
import type { RunnerModel } from '@/types/api'

const props = defineProps<{ trigger: RunnerTrigger; models: RunnerModel[]; gestes: boolean }>()
const emit = defineEmits<{ regle: [trigger: RunnerTrigger]; supprime: [id: number]; relire: [] }>()
const { t } = useI18n()

const cadence = computed(() => cadenceEnMots(props.trigger.cron))
const modele = computed(() => modeleDeclencheur(props.trigger.model, props.models))
const bascule = ref(false)
const refusInterrupteur = ref<Refus | null>(null)
const reglage = ref(false)

function appliquer(rendu: Partial<RunnerTrigger>) {
  emit('regle', apresReglage(props.trigger, rendu))
  emit('relire')
}

// L'interrupteur n'envoie QUE `enabled`. Couper périme les occurrences en attente ;
// rallumer peut être refusé (`no_runner_armed`, `model_key_required`, `model_not_served`),
// et le refus se lit tel que le serveur l'a écrit — jamais « 400 no_runner_armed ».
async function basculer() {
  if (bascule.value) return
  bascule.value = true
  refusInterrupteur.value = null
  try {
    const { trigger } = await updateRunnerTrigger(props.trigger.id, { enabled: !props.trigger.enabled })
    appliquer(trigger)
  } catch (e) {
    refusInterrupteur.value = refusServi(e)
  } finally {
    bascule.value = false
  }
}

function surEnregistre(rendu: Partial<RunnerTrigger>) {
  reglage.value = false
  appliquer(rendu)
}

// Supprimer : confirmé sur place, sans fenêtre d'observation — la ligne part sur `ok: true`.
const {
  phase: phaseSuppression, refus: refusSuppression, demander: demanderSuppression,
  annuler: annulerSuppression, confirmer: confirmerSuppression,
} = useGesteObserve<'supprimer'>({
  envoyer: async () => {
    const { ok } = await deleteRunnerTrigger(props.trigger.id)
    if (ok !== true) throw new Error(t('automations.triggers.form.deleteNotConfirmed'))
    emit('supprime', props.trigger.id)
  },
  relire: () => emit('relire'),
  fenetreMs: () => 0,
})
const enSuppression = computed(() =>
  phaseSuppression.value === 'confirmation' || phaseSuppression.value === 'envoi')
</script>

<template>
  <li class="rt-item">
    <Toggle v-if="gestes" :on="trigger.enabled" :disabled="bascule" data-test="interrupteur" @click="basculer" />
    <span class="rt-name">{{ trigger.label || trigger.procedure }}</span>
    <!-- Le cadencement dans les mots de qui le lit (#860 ②). ⚠️ Quand la forme ne se dit
         pas fidèlement (pas, listes, plages), on RETOMBE sur l'expression brute plutôt que
         d'approximer. -->
    <span class="rt-cron">
      <template v-if="cadence">{{ cadence }}</template>
      <template v-else>{{ trigger.cron }}</template>
      · {{ trigger.tz }}
    </span>
    <span class="rt-model">{{ modele.label ?? t('automations.triggers.form.workerModel') }}</span>
    <Tag v-if="modele.nonServi" tone="terra">{{ t('automations.triggers.form.notServed') }}</Tag>
    <Tag v-if="!trigger.enabled" tone="ink">coupé</Tag>
    <span v-else-if="trigger.next_due" class="rt-next">
      {{ t('automations.triggers.next', { date: absDate(trigger.next_due) }) }}</span>
    <!-- Les occurrences que personne n'est venu prendre avant la suivante : le serveur les
         périme et les COMPTE (`expired_count`, un vrai 0). Un déclencheur qui en accumule
         reste « vert » — il part à l'heure, c'est au bout de la file que rien ne vient. -->
    <span v-if="trigger.expired_count" class="rt-lost">
      <Tag tone="terra">{{ t('automations.triggers.notTaken', trigger.expired_count) }}</Tag>
      <!-- Les DEUX dates : « depuis quand » et « est-ce encore en cours » sont deux
           questions différentes. -->
      <span v-if="trigger.expired_since" class="rt-next">
        depuis {{ absDate(trigger.expired_since) }}<template v-if="trigger.expired_last">,
        dernière {{ absDate(trigger.expired_last) }}</template></span>
    </span>
    <span v-if="gestes && !reglage && !enSuppression" class="rt-actions">
      <Btn kind="link" data-test="regler" @click="reglage = true">{{ t('automations.triggers.form.open') }}</Btn>
      <Btn kind="link" data-test="supprimer" @click="demanderSuppression('supprimer')">{{ t('common.delete') }}</Btn>
    </span>

    <RefusServi v-if="refusInterrupteur" class="rt-full" :refus="refusInterrupteur" />
    <ConfirmerSurPlace v-if="enSuppression" class="rt-full"
      :message="t('automations.triggers.form.deleteConfirm')" :action="t('common.delete')" danger
      :busy="phaseSuppression === 'envoi'" @confirmer="confirmerSuppression" @annuler="annulerSuppression" />
    <RefusServi v-if="refusSuppression" class="rt-full" :refus="refusSuppression" />
    <TriggerSettingsForm v-if="reglage" class="rt-full" :trigger="trigger" :models="models"
      @enregistre="surEnregistre" @annule="reglage = false" />
  </li>
</template>

<style scoped>
.rt-item { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12.5px; }
.rt-name { font-weight: 600; color: var(--color-ink); }
.rt-cron { font-family: var(--font-mono, monospace); font-size: 11.5px; color: var(--color-mute); }
.rt-model { font-size: 11.5px; color: var(--color-mute); }
.rt-next { font-size: 11.5px; color: var(--color-faint); }
.rt-lost { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rt-actions { display: inline-flex; gap: 12px; margin-left: auto; }
.rt-full { flex-basis: 100%; }
</style>
