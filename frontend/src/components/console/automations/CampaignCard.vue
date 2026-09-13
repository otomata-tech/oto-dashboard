<script setup lang="ts">
// UNE campagne : son statut dit comme un fait, et — ouverte — les compteurs de TOUTE la
// campagne (`op=state`), jamais ceux d'une fenêtre de travaux.
//
// Fermée, la carte ne lit rien : `op=state` part à l'ouverture, puis à chaque
// rafraîchissement tant qu'elle reste ouverte. Une erreur de lecture reste DANS la
// carte et s'efface à la lecture suivante réussie — elle ne remplace ni la liste ni
// les autres cartes.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from '../Btn.vue'
import Notice from '../Notice.vue'
import Tag from '../Tag.vue'
import CampaignActions from './CampaignActions.vue'
import RunnerJobList from './RunnerJobList.vue'
import { getRunnerFleetState, type RunnerFleet, type RunnerFleetState, type RunnerJob } from '@/api/console'
import { inscrireRafraichissement, useMaintenant } from '@/composables/useRafraichissement'
import { absDate } from '@/lib/cellRender'
import { humanize } from '@/lib/errors'
import { armeeSansTravail, compteurs, jetons, libelleCampagne } from '@/lib/runnerFleets'
import { duree } from '@/lib/runnerJobs'

// La campagne affichée est celle de la LISTE (prop) : la carte ne garde pas sa propre
// copie. Ce qu'elle apprend du serveur — la flotte rendue par `op=state`, ou par un
// geste — remonte par `flotte`, et la liste la remplace. Un seul endroit tient le statut.
const props = defineProps<{ fleet: RunnerFleet; ouverteParDefaut: boolean }>()
const emit = defineEmits<{ ouvrir: [job: RunnerJob]; flotte: [fleet: RunnerFleet] }>()
const { t } = useI18n()
const maintenant = useMaintenant()

const ouverte = ref(props.ouverteParDefaut)
const travaux = ref(false)
const etat = ref<RunnerFleetState | null>(null)
const erreur = ref<string | null>(null)

// Deux lectures peuvent se croiser (ouverture puis rafraîchissement) : seule la
// dernière demandée écrit, sinon un état plus ancien écraserait un plus récent.
let demande = 0
async function lireEtat() {
  if (!ouverte.value) return
  const n = ++demande
  try {
    const { fleet, state } = await getRunnerFleetState(props.fleet.id)
    if (n !== demande) return
    etat.value = state
    erreur.value = null
    if (fleet) emit('flotte', fleet)
  } catch (e) {
    if (n === demande) erreur.value = humanize(e)
  }
}

/** La réponse d'un geste est plus récente que toute relecture partie avant lui : elle
 * l'invalide, sinon un `stopped` d'avant la relance écraserait le `armed` qu'elle sert. */
function surGeste(f: RunnerFleet) {
  ++demande
  emit('flotte', f)
}

function basculer() {
  ouverte.value = !ouverte.value
  if (ouverte.value) void lireEtat()
}

const libelle = computed(() => libelleCampagne(props.fleet, etat.value))
const historique = computed(() => libelle.value.cle.endsWith('.historical'))
const sansTravailDepuis = computed(() => armeeSansTravail(props.fleet, maintenant.value))

/** ⚠️ Le serveur somme `usage_tokens` avec un repli à 0 : sur une campagne dont AUCUN
 * travail n'est conclu, aucun résultat n'existe encore, et ce 0 serait un coût
 * inventé. On le dit inconnu. Dès qu'un travail est conclu, le nombre servi fait foi. */
const jetonsCampagne = computed(() => {
  const e = etat.value
  if (!e) return null
  if (!(e.done ?? 0) && !(e.failed ?? 0)) return null
  return jetons(e.usage_tokens)
})

onMounted(() => { if (ouverte.value) void lireEtat() })
inscrireRafraichissement(lireEtat)
</script>

<template>
  <li class="cc">
    <button type="button" class="cc-head" :aria-expanded="ouverte" @click="basculer">
      <span class="cc-name">{{ fleet.label || fleet.procedure || `#${fleet.id}` }}</span>
      <Tag :tone="libelle.ton">{{ t(libelle.cle, libelle.params) }}</Tag>
      <span v-if="fleet.label && fleet.procedure" class="cc-meta">{{ fleet.procedure }}</span>
      <span v-if="fleet.namespace" class="cc-meta cc-mono">{{ fleet.namespace }}</span>
      <span class="cc-meta cc-mono">{{ fleet.model ?? t('automations.campaign.noModel') }}</span>
    </button>
    <p v-if="historique" class="cc-mute">{{ t('automations.campaign.status.historicalHint') }}</p>

    <div v-if="ouverte" class="cc-body">
      <CampaignActions :fleet="fleet" :etat="etat" @flotte="surGeste" @relire="lireEtat" />
      <Notice v-if="sansTravailDepuis !== null" tone="warn">
        {{ t('automations.campaign.armedIdle', { duration: duree(sansTravailDepuis) }) }}
      </Notice>
      <p v-if="erreur" class="cc-err" role="alert">
        {{ t('automations.campaign.error', { reason: erreur }) }}</p>
      <p v-if="!etat && !erreur" class="cc-mute">{{ t('automations.campaign.loading') }}</p>
      <p v-else-if="etat?.no_jobs_attached" class="cc-mute">{{ t('automations.campaign.noJobs') }}</p>
      <template v-else-if="etat">
        <dl class="cc-dl" data-test="compteurs">
          <div v-for="c in compteurs(etat)" :key="c.cle" :class="{ alerte: c.alerte }">
            <dt>{{ t(`automations.campaign.counters.${c.cle}`) }}</dt><dd>{{ c.n ?? '—' }}</dd>
          </div>
          <div><dt>{{ t('automations.campaign.counters.total') }}</dt><dd>{{ etat.jobs_total }}</dd></div>
        </dl>
        <dl class="cc-dl">
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
        <div>
          <Btn kind="link" :aria-expanded="travaux" @click="travaux = !travaux">
            {{ travaux ? t('automations.campaign.hideJobs') : t('automations.campaign.showJobs') }}</Btn>
        </div>
        <RunnerJobList v-if="travaux" :filtre="{ fleet_id: fleet.id }" @ouvrir="(j) => emit('ouvrir', j)" />
      </template>
    </div>
  </li>
</template>

<style scoped>
.cc { border-bottom: 1px solid var(--color-hair); padding-bottom: 10px; }
.cc:last-child { border-bottom: 0; padding-bottom: 0; }
.cc-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; width: 100%;
  background: none; border: 0; padding: 0; cursor: pointer; text-align: left; font: inherit;
  font-size: 12.5px;
}
.cc-name { font-weight: 600; font-size: 13.5px; color: var(--color-ink); }
.cc-meta { font-size: 11.5px; color: var(--color-mute); }
.cc-mono { font-family: var(--font-mono, monospace); font-size: 11px; }
.cc-body { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.cc-dl { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0; }
.cc-dl div { display: flex; gap: 6px; align-items: baseline; }
.cc-dl dt { font-size: 11px; color: var(--color-faint); }
.cc-dl dd { margin: 0; font-size: 12.5px; font-weight: 600; color: var(--color-ink); }
.cc-dl .alerte dd { color: var(--color-terra-ink); }
.cc-mute { margin: 4px 0 0; font-size: 12px; color: var(--color-mute); }
.cc-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
