<script setup lang="ts">
// Régler UN déclencheur, en ligne (oto#205, lot 2) : tout ce que le backend sert — horaire,
// fuseau, modèle ; un webhook n'a ni horaire ni fuseau, il ne règle que son modèle. L'interrupteur et la suppression vivent sur la ligne (`TriggerRow`).
//
// ⚠️ Seuls les champs MODIFIÉS partent (`champsModifies`) : `op=update` est partiel.
// ⚠️ Le modèle est OBLIGATOIRE (24/09/2026) : un agent hébergé sans modèle déclaré ne
// tourne plus. Il ne se présélectionne JAMAIS sur le `default` du catalogue : sur un
// déclencheur qui n'en a pas, le formulaire le DIT et n'enregistre rien tant qu'aucun n'est
// choisi.
// La validation (cron, fuseau, cadence plancher) reste au serveur : `invalid_schedule`
// s'affiche sous l'horaire, avec le `detail` qui nomme le fautif.
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'
import OtoSelect from '../OtoSelect.vue'
import RefusServi from './RefusServi.vue'
import { updateRunnerTrigger, type RunnerTrigger } from '@/api/console'
import { estWebhook } from '@/lib/automationsEspace'
import { cadenceEnMots } from '@/lib/cadence'
import {
  champsModifies, fuseauxProposes, optionsModele, refusServi, reglageInitial, type Refus,
} from '@/lib/runnerGestes'
import type { RunnerModel } from '@/types/api'

const props = defineProps<{ trigger: RunnerTrigger; models: RunnerModel[] }>()
const emit = defineEmits<{ enregistre: [rendu: Partial<RunnerTrigger>]; annule: [] }>()
const { t } = useI18n()

// Le réglage de départ est figé à l'ouverture : une relecture de la liste pendant la
// saisie ne doit ni effacer ce qui est tapé, ni faire passer pour modifié ce qui ne l'est pas.
const initial = reglageInitial(props.trigger)
const saisi = reactive({ ...initial })
const envoi = ref(false)
const refusHoraire = ref<Refus | null>(null)
const refus = ref<Refus | null>(null)

const modifies = computed(() => champsModifies(initial, saisi))
const inchange = computed(() => Object.keys(modifies.value).length === 0)
const sansModele = computed(() => !saisi.model)
const apercu = computed(() => cadenceEnMots(saisi.cron))
const fuseaux = computed(() => fuseauxProposes(initial.tz).map((z) => ({ value: z, label: z })))
const modeles = computed(() => optionsModele(props.models, initial.model).map((o) => ({
  value: o.value,
  label: o.nonServi ? `${o.label} · ${t('automations.triggers.form.notServed')}` : o.label,
})))

async function enregistrer() {
  if (inchange.value || sansModele.value || envoi.value) return
  envoi.value = true
  refus.value = null
  refusHoraire.value = null
  try {
    const { trigger } = await updateRunnerTrigger(props.trigger.id, modifies.value)
    emit('enregistre', trigger)
  } catch (e) {
    const r = refusServi(e)
    if (r.code === 'invalid_schedule') refusHoraire.value = r
    else refus.value = r
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <form class="tsf" data-test="reglage" @submit.prevent="enregistrer">
    <template v-if="!estWebhook(trigger)">
      <div class="tsf-field" data-test="champ-horaire">
        <label class="tsf-lbl" :for="`tsf-cron-${trigger.id}`">{{ t('automations.triggers.form.schedule') }}</label>
        <div class="tsf-line">
          <input :id="`tsf-cron-${trigger.id}`" v-model="saisi.cron" class="inp mono sm tsf-cron"
            data-test="cron" spellcheck="false" autocomplete="off" />
          <span v-if="apercu" class="tsf-hint">{{ apercu }}</span>
        </div>
        <RefusServi v-if="refusHoraire" :refus="refusHoraire" />
      </div>
      <div class="tsf-field">
        <span class="tsf-lbl">{{ t('automations.triggers.form.timezone') }}</span>
        <OtoSelect v-model="saisi.tz" :options="fuseaux" size="sm"
          :aria-label="t('automations.triggers.form.timezone')" />
      </div>
    </template>
    <div class="tsf-field" data-test="champ-modele">
      <span class="tsf-lbl">{{ t('automations.triggers.form.model') }}</span>
      <OtoSelect v-model="saisi.model" :options="modeles" size="sm"
        :placeholder="t('automations.triggers.form.chooseModel')"
        :aria-label="t('automations.triggers.form.model')" />
      <span v-if="sansModele" class="tsf-hint" data-test="modele-requis">{{ t('automations.triggers.form.modelMissing') }}</span>
    </div>
    <div class="tsf-line">
      <Btn kind="mini" type="submit" data-test="enregistrer" :disabled="inchange || sansModele || envoi"
        :aria-busy="envoi || undefined">{{ t('common.save') }}</Btn>
      <Btn kind="link" type="button" :disabled="envoi" @click="emit('annule')">{{ t('common.cancel') }}</Btn>
    </div>
    <RefusServi v-if="refus" :refus="refus" />
  </form>
</template>

<style scoped>
.tsf {
  display: flex; flex-direction: column; gap: 10px; padding: 10px 12px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-md); background: var(--color-surface);
}
.tsf-field { display: flex; flex-direction: column; gap: 4px; }
.tsf-lbl { font-size: 11px; color: var(--color-faint); }
.tsf-line { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.tsf-cron { max-width: 16rem; }
.tsf-hint { font-size: 11.5px; color: var(--color-mute); }
</style>
