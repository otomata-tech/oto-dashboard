<script setup lang="ts">
// Les CAMPAGNES de l'org (oto#205), sur la page `/automations/campaigns` (oto#214).
//
// Ordre : les vivantes (`armed`, `running`, `stopping`), puis les récentes, puis un
// repli « N campagnes anciennes » dont le compteur est celui de la liste servie. Les
// cartes vivantes et récentes s'ouvrent seules ; les anciennes ne lisent leur état
// qu'à l'ouverture.
//
// Le filtre par statut (`filtre`, porté par l'URL de la page) s'applique à la liste
// COMPLÈTE : `fleets op=list` rend toutes les campagnes de l'org, sans pagination.
// « vivante », qui règle le rythme du rafraîchissement, se lit sur la liste entière.
//
// ⚠️ UNE seule liste à clés pour les trois groupes (lot 2). Un geste fait changer une
// campagne de groupe — une ancienne relancée devient vivante : rangée dans deux listes
// séparées, sa carte serait démontée puis remontée, et son observation perdue en plein
// témoin.
//
// ⚠️ Une campagne ÉCRITE par une carte (réponse d'un geste, relecture `op=state`) n'est
// pas écrasée par une lecture de la liste partie AVANT elle : cette lecture rendrait un
// état plus ancien que celui qu'on affiche (`fusionnerLecture`).
//
// ⚠️ Sans l'option bêta de l'org, toute opération sur les flottes répond 403
// `beta_required`. Ce n'est pas une panne : l'écran le dit comme un fait, sans rouge.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '../ConsoleCard.vue'
import CampaignCard from './CampaignCard.vue'
import { ApiError } from '@/api'
import { listRunnerFleets, type RunnerFleet } from '@/api/console'
import { inscrireRafraichissement, useMaintenant } from '@/composables/useRafraichissement'
import { garderCampagne, type FiltreCampagne } from '@/lib/automationsEspace'
import { humanize } from '@/lib/errors'
import { estVivante, RECENTE_JOURS, repartir } from '@/lib/runnerFleets'
import { fusionnerLecture } from '@/lib/runnerGestes'

const props = withDefaults(defineProps<{ filtre?: FiltreCampagne | null }>(), { filtre: null })
const emit = defineEmits<{ vivante: [oui: boolean] }>()
const { t } = useI18n()
const maintenant = useMaintenant()

const fleets = ref<RunnerFleet[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const betaAbsente = ref(false)
const anciennesOuvertes = ref(false)

// Un seul compteur ordonne les lectures de la liste ET les écritures des cartes.
let sequence = 0
let appliquee = 0
const ecriteA = new Map<number, number>()

async function charger() {
  const n = ++sequence
  try {
    const { fleets: lues } = await listRunnerFleets()
    if (n < appliquee) return
    appliquee = n
    fleets.value = fusionnerLecture(fleets.value, lues, (id) => (ecriteA.get(id) ?? 0) > n)
    error.value = null
    betaAbsente.value = false
  } catch (e) {
    if (n < appliquee) return
    if (e instanceof ApiError && e.status === 403 && e.code === 'beta_required') {
      betaAbsente.value = true
      fleets.value = []
      error.value = null
    } else {
      error.value = humanize(e)
    }
  } finally {
    loaded.value = true
  }
}

function remplacer(f: RunnerFleet) {
  ecriteA.set(f.id, ++sequence)
  fleets.value = fleets.value.map((x) => (x.id === f.id ? f : x))
}

const visibles = computed(() => fleets.value.filter((f) => garderCampagne(f, props.filtre)))
const groupes = computed(() => repartir(visibles.value, maintenant.value))

interface Entree { cle: string; fleet: RunnerFleet | null; ouverte: boolean }
const entrees = computed<Entree[]>(() => {
  const g = groupes.value
  const carte = (ouverte: boolean) => (f: RunnerFleet): Entree => ({ cle: `f${f.id}`, fleet: f, ouverte })
  const out = [...g.vivantes, ...g.recentes].map(carte(true))
  if (g.anciennes.length) {
    out.push({ cle: 'pli', fleet: null, ouverte: false })
    if (anciennesOuvertes.value) out.push(...g.anciennes.map(carte(false)))
  }
  return out
})

watch(() => fleets.value.some(estVivante), (oui) => emit('vivante', oui), { immediate: true })

onMounted(charger)
inscrireRafraichissement(charger)
</script>

<template>
  <ConsoleCard :title="t('automations.campaigns.title')" :sub="t('automations.campaigns.sub')">
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    <div class="card-body">
      <p v-if="betaAbsente" class="cs-mute" data-test="beta">{{ t('automations.campaigns.betaOff') }}</p>
      <template v-else>
        <p v-if="error" class="cs-err" role="alert">
          {{ t('automations.campaigns.error', { reason: error }) }}</p>
        <p v-if="!loaded" class="cs-mute">{{ t('common.loading') }}</p>
        <p v-else-if="!fleets.length && !error" class="cs-mute">{{ t('automations.campaigns.empty') }}</p>
        <p v-else-if="!visibles.length && !error" class="cs-mute">{{ t('automations.campaigns.filteredEmpty') }}</p>

        <ul v-if="entrees.length" class="cs-list">
          <template v-for="e in entrees" :key="e.cle">
            <CampaignCard v-if="e.fleet" :fleet="e.fleet" :ouverte-par-defaut="e.ouverte" @flotte="remplacer" />
            <li v-else class="cs-fold">
              <button type="button" class="cs-fold-btn" :aria-expanded="anciennesOuvertes"
                @click="anciennesOuvertes = !anciennesOuvertes">
                {{ t('automations.campaigns.older', groupes.anciennes.length) }}
                <span class="cs-mute">· {{ t('automations.campaigns.olderHint', { days: RECENTE_JOURS }) }}</span>
              </button>
            </li>
          </template>
        </ul>
      </template>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.cs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.cs-fold { padding-top: 4px; }
.cs-fold-btn {
  font: inherit; font-size: 12.5px; font-weight: 600; color: var(--color-ink);
  background: none; border: 0; padding: 0; cursor: pointer; text-align: left;
}
.cs-mute { margin: 0; font-size: 12.5px; font-weight: 400; color: var(--color-mute); }
.cs-err { margin: 0 0 8px; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
