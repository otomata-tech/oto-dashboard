<script setup lang="ts">
// UN déclencheur : quelle procédure part quand, sur quel modèle, ce qu'il a perdu — et ses
// gestes : l'interrupteur, « Régler » (formulaire en ligne), « Supprimer » (confirmé sur
// place). Extrait de `RunnerTriggersCard` (oto#205, lot 2) ; son nom mène à la page de la
// programmation (oto#214), et ses gestes vivent dans `useGestesDeclencheur`, partagé avec la
// page des réglages.
//
// Les droits reflètent le serveur TEL QU'IL EST SERVI : `runner.triggers` est ouvert à tout
// membre, sans garde admin ni bêta, et l'écran n'en ajoute aucune. `gestes` est faux en
// consultation en lecture seule, où le serveur refuse toute mutation.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'
import Tag from '../Tag.vue'
import Toggle from '../Toggle.vue'
import ConfirmerSurPlace from './ConfirmerSurPlace.vue'
import RefusServi from './RefusServi.vue'
import TriggerSettingsForm from './TriggerSettingsForm.vue'
import type { RunnerTrigger } from '@/api/console'
import { useGestesDeclencheur } from '@/composables/useGestesDeclencheur'
import { estWebhook, nomProgrammation } from '@/lib/automationsEspace'
import { cadenceEnMots } from '@/lib/cadence'
import { absDate } from '@/lib/cellRender'
import { modeleDeclencheur } from '@/lib/runnerGestes'
import type { RunnerModel } from '@/types/api'

const props = defineProps<{ trigger: RunnerTrigger; models: RunnerModel[]; gestes: boolean }>()
const emit = defineEmits<{ regle: [trigger: RunnerTrigger]; supprime: [id: number]; relire: [] }>()
const { t } = useI18n()

const cadence = computed(() => cadenceEnMots(props.trigger.cron))
const modele = computed(() => modeleDeclencheur(props.trigger.model, props.models))
const reglage = ref(false)

const {
  bascule, refusInterrupteur, appliquer, basculer, enSuppression, phaseSuppression,
  refusSuppression, demanderSuppression, annulerSuppression, confirmerSuppression,
} = useGestesDeclencheur({
  trigger: () => props.trigger,
  surRegle: (tr) => emit('regle', tr),
  surSupprime: (id) => emit('supprime', id),
  relire: () => emit('relire'),
})

function surEnregistre(rendu: Partial<RunnerTrigger>) {
  reglage.value = false
  appliquer(rendu)
}
</script>

<template>
  <li class="rt-item">
    <Toggle v-if="gestes" :on="trigger.enabled" :disabled="bascule" data-test="interrupteur" @click="basculer" />
    <RouterLink :to="`/automations/schedules/${trigger.id}`" class="rt-name" data-test="page-programmation">
      {{ nomProgrammation(trigger) }}</RouterLink>
    <!-- Le cadencement dans les mots de qui le lit (#860 ②). ⚠️ Quand la forme ne se dit
         pas fidèlement (pas, listes, plages), on RETOMBE sur l'expression brute plutôt que
         d'approximer. -->
    <!-- Un webhook n'a pas d'horaire : il se dit par son genre et ce qu'il a reçu. -->
    <template v-if="estWebhook(trigger)">
      <Tag tone="cobalt" data-test="genre">{{ t('automationsWebhook.kind') }}</Tag>
      <span class="rt-next" data-test="recues">{{ t('automationsWebhook.received24h', trigger.deliveries_24h ?? 0) }}<template
        v-if="trigger.deliveries_refused_24h">, {{ t('automationsWebhook.refused24h', trigger.deliveries_refused_24h) }}</template></span>
    </template>
    <span v-else class="rt-cron">
      <template v-if="cadence">{{ cadence }}</template>
      <template v-else>{{ trigger.cron }}</template>
      · {{ trigger.tz }}
    </span>
    <span class="rt-model">{{ modele.label ?? t('automations.triggers.form.workerModel') }}</span>
    <Tag v-if="modele.nonServi" tone="terra">{{ t('automations.triggers.form.notServed') }}</Tag>
    <Tag v-if="!trigger.enabled" tone="ink">{{ t('automations.schedulePage.disabled') }}</Tag>
    <span v-else-if="trigger.next_due && !estWebhook(trigger)" class="rt-next">
      {{ t('automations.triggers.next', { date: absDate(trigger.next_due) }) }}</span>
    <!-- Les occurrences que personne n'est venu prendre avant la suivante : le serveur les
         périme et les COMPTE (`expired_count`, un vrai 0). Un déclencheur qui en accumule
         reste « vert » — il part à l'heure, c'est au bout de la file que rien ne vient. -->
    <span v-if="trigger.expired_count" class="rt-lost">
      <Tag tone="terra">{{ t('automations.triggers.notTaken', trigger.expired_count) }}</Tag>
      <!-- Les DEUX dates : « depuis quand » et « est-ce encore en cours » sont deux
           questions différentes. -->
      <span v-if="trigger.expired_since" class="rt-next">
        {{ t('automations.schedulePage.lostSince', { date: absDate(trigger.expired_since) }) }}<template
          v-if="trigger.expired_last">, {{ t('automations.schedulePage.lostLast', { date: absDate(trigger.expired_last) }) }}</template></span>
    </span>
    <span v-if="gestes && !reglage && !enSuppression" class="rt-actions">
      <Btn kind="link" data-test="regler" @click="reglage = true">{{ t('automations.triggers.form.open') }}</Btn>
      <Btn kind="link" data-test="supprimer" @click="demanderSuppression">{{ t('common.delete') }}</Btn>
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
.rt-name:hover { color: var(--color-saffron-ink); }
.rt-cron { font-family: var(--font-mono, monospace); font-size: 11.5px; color: var(--color-mute); }
.rt-model { font-size: 11.5px; color: var(--color-mute); }
.rt-next { font-size: 11.5px; color: var(--color-faint); }
.rt-lost { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rt-actions { display: inline-flex; gap: 12px; margin-left: auto; }
.rt-full { flex-basis: 100%; }
</style>
