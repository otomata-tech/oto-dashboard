<script setup lang="ts">
// /automations/schedules/:id/settings — les RÉGLAGES d'une programmation, regroupés sur une
// page (oto#214) : l'interrupteur, le formulaire (horaire, fuseau, modèle) et la suppression,
// tels que les lots 1 et 2 les offraient sur la ligne — rien de plus.
//
// Les droits sont ceux du serveur SERVI : `runner.triggers` n'a aucune garde admin, tout membre
// règle hors consultation ; en consultation en lecture seule, le serveur refuse toute
// écriture, et la page n'offre aucun geste. La réserve admin décidée pour activer et
// configurer n'est pas servie : l'écran ne la simule pas.
//
// Enregistrer mène à la page de la programmation, qui relit ce que le serveur a retenu ;
// supprimer mène à la liste.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Btn from '@/components/console/Btn.vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Toggle from '@/components/console/Toggle.vue'
import ConfirmerSurPlace from '@/components/console/automations/ConfirmerSurPlace.vue'
import ObjetAdresse from '@/components/console/automations/ObjetAdresse.vue'
import RefusServi from '@/components/console/automations/RefusServi.vue'
import TriggerSettingsForm from '@/components/console/automations/TriggerSettingsForm.vue'
import { getRunnerTrigger } from '@/api/console'
import { useGestesDeclencheur } from '@/composables/useGestesDeclencheur'
import { useLectureParId } from '@/composables/useLectureParId'
import { useMe } from '@/composables/useMe'
import { nomProgrammation } from '@/lib/automationsEspace'
import { droits } from '@/lib/runnerGestes'

const { t } = useI18n()
const router = useRouter()
const { me } = useMe()

const lecture = useLectureParId((id) => getRunnerTrigger(id))
const gestes = computed(() => droits(me.value).ouverts)
const page = computed(() => `/automations/schedules/${lecture.brut.value}`)

const {
  bascule, refusInterrupteur, basculer, enSuppression, phaseSuppression, refusSuppression,
  demanderSuppression, annulerSuppression, confirmerSuppression,
} = useGestesDeclencheur({
  trigger: () => {
    const lu = lecture.objet.value
    if (!lu) throw new Error('programmation non lue : aucun geste ne peut partir')
    return lu.trigger
  },
  surRegle: (trigger) => {
    const lu = lecture.objet.value
    if (lu) lecture.appliquer(lecture.jeton(), { ...lu, trigger })
  },
  surSupprime: () => { void router.replace('/automations/schedules') },
  relire: () => lecture.lire(),
})

const retour = () => { void router.push(page.value) }
</script>

<template>
  <div class="content-inner">
    <ObjetAdresse :lecture="lecture" titre="automations.schedulePage.refused">
      <template #default="{ objet: { trigger, runner } }">
        <ConsoleCard :title="t('automations.schedulePage.settings')" :sub="nomProgrammation(trigger)">
          <template #actions>
            <RouterLink :to="page" class="btn-mini" data-test="retour">{{ t('automations.schedulePage.back') }}</RouterLink>
          </template>
          <div class="card-body ss">
            <p v-if="!gestes" class="ss-mute" data-test="lecture-seule">{{ t('automations.schedulePage.readOnly') }}</p>
            <template v-else>
              <div class="ss-ligne">
                <Toggle :on="trigger.enabled" :disabled="bascule" data-test="interrupteur" @click="basculer" />
                <span>{{ trigger.enabled ? t('automations.schedulePage.enabled') : t('automations.schedulePage.disabled') }}</span>
              </div>
              <RefusServi v-if="refusInterrupteur" :refus="refusInterrupteur" />

              <TriggerSettingsForm :key="trigger.id" :trigger="trigger" :models="runner?.models ?? []"
                @enregistre="retour" @annule="retour" />

              <div class="ss-ligne">
                <ConfirmerSurPlace v-if="enSuppression" :message="t('automations.triggers.form.deleteConfirm')"
                  :action="t('common.delete')" danger :busy="phaseSuppression === 'envoi'"
                  @confirmer="confirmerSuppression" @annuler="annulerSuppression" />
                <Btn v-else kind="danger" data-test="supprimer" @click="demanderSuppression">{{ t('common.delete') }}</Btn>
              </div>
              <RefusServi v-if="refusSuppression" :refus="refusSuppression" />
              <p class="helptext">{{ t('automations.triggers.effect') }}</p>
            </template>
          </div>
        </ConsoleCard>
      </template>
    </ObjetAdresse>
  </div>
</template>

<style scoped>
.ss { display: flex; flex-direction: column; gap: 12px; }
.ss-ligne { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12.5px; color: var(--color-ink); }
.ss-mute { margin: 0; font-size: 12.5px; color: var(--color-mute); }
</style>
