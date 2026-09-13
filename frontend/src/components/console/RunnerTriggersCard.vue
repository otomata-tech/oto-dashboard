<script setup lang="ts">
// Déclencheurs programmés du runner — quelle procédure part quand, sur quel modèle, et
// leurs réglages. La CRÉATION passe par l'agent (`oto_trigger`) : cette carte surveille,
// règle et supprime, elle ne fabrique pas — poser un nouvel agent est un dialogue, pas un
// formulaire. Chaque ligne est un `automations/TriggerRow` (oto#205, lot 2).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import TriggerRow from './automations/TriggerRow.vue'
import { listRunnerTriggers } from '@/api/console'
import type { RunnerArme, RunnerTrigger } from '@/api/console'
import { inscrireRafraichissement } from '@/composables/useRafraichissement'
import { useMe } from '@/composables/useMe'
import { humanize } from '@/lib/errors'
import { droits } from '@/lib/runnerGestes'

// Montée à deux endroits (#860 ①) : la page Automatisations, qui montre l'org entière, et
// la fiche d'UNE procédure (`DoctrineView`), qui ne doit répondre qu'à « celle-ci
// tourne-t-elle ? » — le MÊME composant, donc les mêmes gestes. Le filtre est SERVEUR —
// filtrer côté client devient faux dès qu'il y a plus d'une page de déclencheurs.
const props = defineProps<{ procedure?: string }>()
// La présence du runner (`runner`) voyage avec la liste : la page la remonte au bandeau
// au lieu de relire la même route. Sur l'écran d'une procédure, personne n'écoute.
const emit = defineEmits<{ runner: [runner: RunnerArme | null]; 'runner-error': [raison: string] }>()
const { me } = useMe()

const triggers = ref<RunnerTrigger[]>([])
const runner = ref<RunnerArme | null>(null)
const loaded = ref(false)
const error = ref<string | null>(null)
// Le catalogue des modèles voyage avec la liste (bloc `runner`) : c'est lui que le
// formulaire propose, marqué de ce qui est servi.
const models = computed(() => runner.value?.models ?? [])
// `runner.triggers` est ouvert à tout membre : seule la lecture seule masque les gestes.
const gestes = computed(() => droits(me.value).ouverts)

// Seule la dernière lecture demandée écrit : la relecture qui suit un réglage ne doit pas
// être écrasée par une lecture partie avant lui.
let demande = 0
async function load() {
  const n = ++demande
  try {
    const res = await listRunnerTriggers(props.procedure)
    if (n !== demande) return
    triggers.value = res.triggers
    runner.value = res.runner ?? null
    error.value = null
    emit('runner', runner.value)
  } catch (e) {
    if (n !== demande) return
    error.value = humanize(e)
    emit('runner-error', error.value)
  } finally {
    loaded.value = true
  }
}

function remplacer(t: RunnerTrigger) {
  triggers.value = triggers.value.map((x) => (x.id === t.id ? t : x))
}
function retirer(id: number) {
  triggers.value = triggers.value.filter((x) => x.id !== id)
}

onMounted(load)
inscrireRafraichissement(load)
</script>

<template>
  <ConsoleCard
    :title="props.procedure ? 'Agent programmé' : 'Déclencheurs programmés'"
    :sub="props.procedure
      ? 'Cette procédure tourne-t-elle toute seule, et à quel rythme ?'
      : 'Les procédures qui partent toutes seules, à heure fixe — et leur robinet.'"
  >
    <div class="card-body">
      <p v-if="error" class="rt-err" role="alert">{{ error }}</p>
      <p v-if="loaded && !triggers.length && !error" class="dim rt-empty">
        <template v-if="props.procedure">
          Cette procédure ne tourne pas toute seule. Pour qu'elle parte à heure fixe,
          demande-le à ton agent (« fais tourner cette procédure tous les jours à
          8 h ») — il utilisera <code>oto_trigger</code>.
        </template>
        <template v-else>
          Aucun déclencheur. Demande à ton agent d'en créer un
          (« déclenche la procédure X tous les jours à 8 h ») — il utilisera
          <code>oto_trigger</code>.
        </template>
      </p>
      <ul v-if="triggers.length" class="rt-list">
        <TriggerRow v-for="t in triggers" :key="t.id" :trigger="t" :models="models" :gestes="gestes"
          @regle="remplacer" @supprime="retirer" @relire="load" />
      </ul>
      <!-- #860 ④ — ce que l'interrupteur FAIT, vérifié dans le backend :
           · couper → `update_trigger` appelle `perimer_travaux_du_declencheur` : les
             occurrences en attente ne partiront jamais ;
           · rallumer → `op=update enabled=true` recalcule `next_due` depuis maintenant
             (`efa0cebc`, #826) : l'échéance manquée pendant l'arrêt n'est pas rattrapée. -->
      <p v-if="loaded && triggers.length" class="dim rt-effet">
        Couper périme les occurrences en attente : elles ne partiront jamais.
        Rallumer reprend le rythme à partir de maintenant — l'échéance manquée
        pendant l'arrêt n'est pas rattrapée.
      </p>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.rt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rt-err { font-size: 12px; color: var(--color-terra-ink); }
.rt-empty { font-size: 13px; line-height: 1.6; }
.rt-effet { font-size: 11.5px; line-height: 1.55; margin: 10px 0 0; }
</style>
