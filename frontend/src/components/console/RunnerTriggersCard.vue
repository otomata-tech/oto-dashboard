<script setup lang="ts">
// Déclencheurs programmés du runner — quelle procédure part quand, et le
// robinet enabled. La CRÉATION passe par l'agent (`oto_trigger`) : cette carte
// surveille et coupe/rouvre, elle ne fabrique pas — configurer un cron est un
// dialogue, pas un formulaire.
import { onMounted, ref } from 'vue'
import { cadenceEnMots } from '@/lib/cadence'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Toggle from './Toggle.vue'
import { listRunnerTriggers, setRunnerTriggerEnabled } from '@/api/console'
import type { RunnerTrigger } from '@/api/console'
import { humanize } from '@/lib/errors'
import { absDate } from '@/lib/cellRender'

// Montée à deux endroits (#860 ①) : la page Automatisations, qui montre l'org
// entière, et l'écran d'UNE procédure, qui ne doit répondre qu'à « celle-ci
// tourne-t-elle ? ». Le filtre est SERVEUR — filtrer côté client devient faux dès
// qu'il y a plus d'une page de déclencheurs.
const props = defineProps<{ procedure?: string }>()

const triggers = ref<RunnerTrigger[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const busy = ref<number | null>(null)

async function load() {
  try {
    triggers.value = (await listRunnerTriggers(props.procedure)).triggers
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
  }
}

async function toggle(t: RunnerTrigger) {
  busy.value = t.id
  try {
    const { trigger } = await setRunnerTriggerEnabled(t.id, !t.enabled)
    Object.assign(t, trigger)
  } catch (e) {
    error.value = humanize(e)
  } finally {
    busy.value = null
  }
}

onMounted(load)
</script>

<template>
  <ConsoleCard
    :title="props.procedure ? 'Agent programmé' : 'Déclencheurs programmés'"
    :sub="props.procedure
      ? 'Cette procédure tourne-t-elle toute seule, et à quel rythme ?'
      : 'Les procédures qui partent toutes seules, à heure fixe — et leur robinet.'"
  >
    <div class="card-body">
      <p v-if="error" class="rt-err">{{ error }}</p>
      <p v-else-if="loaded && !triggers.length" class="dim rt-empty">
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
      <ul v-else class="rt-list">
        <li v-for="t in triggers" :key="t.id" class="rt-item">
          <Toggle :on="t.enabled" :disabled="busy === t.id" @click="toggle(t)" />
          <span class="rt-name">{{ t.label || t.procedure }}</span>
          <!-- Le cadencement dans les mots de qui le lit (#860 ②) : `0 18 * * *` est
               le vocabulaire de qui a écrit le déclencheur, pas de la personne qui
               vient vérifier que son agent tourne bien tous les soirs.
               ⚠️ Quand la forme ne se dit pas fidèlement (pas, listes, plages), on
               RETOMBE sur l'expression brute plutôt que d'approximer : une phrase
               fausse sur un horaire fait conclure « il tourne le lundi » à quelqu'un
               qui ne rouvrira pas la page. L'expression reste alors en second, pour
               qui sait la lire. -->
          <span class="rt-cron">
            <template v-if="cadenceEnMots(t.cron)">{{ cadenceEnMots(t.cron) }}</template>
            <template v-else>{{ t.cron }}</template>
            · {{ t.tz }}
          </span>
          <Tag v-if="!t.enabled" tone="ink">coupé</Tag>
          <span v-else-if="t.next_due" class="rt-next">
            prochain : {{ absDate(t.next_due) }}</span>
          <!-- Ce que ce déclencheur a PERDU. Servi par le backend depuis le 01/09 et
               affiché nulle part : quarante-et-une occurrences empilées sur treize
               jours n'ont été découvertes que par hasard, le 02/09, en préparant
               autre chose. Un déclencheur qui perd ses occurrences reste « vert » —
               il part à l'heure, c'est au bout de la file que rien ne vient.
               `0` est un vrai zéro : rien à dire, donc rien d'affiché. -->
          <span v-if="t.expired_count" class="rt-lost">
            <Tag tone="terra">{{ t.expired_count }} perdue<template
              v-if="t.expired_count > 1">s</template></Tag>
            <!-- Les DEUX dates, jamais une seule : « depuis quand » et « est-ce
                 encore en cours » sont deux questions différentes, et une perte
                 ancienne qui a cessé n'appelle pas le même geste qu'une perte de ce
                 matin. C'est le serveur qui le souligne, on ne le résume pas. -->
            <span v-if="t.expired_since" class="rt-next">
              depuis {{ absDate(t.expired_since) }}<template v-if="t.expired_last">,
              dernière {{ absDate(t.expired_last) }}</template></span>
          </span>
        </li>
      </ul>
      <!-- #860 ④ — ce que l'interrupteur FAIT, sinon le comportement surprend.
           Vérifié dans le backend, pas déduit de l'issue :
           · couper → `update_trigger` appelle `perimer_travaux_du_declencheur` : les
             occurrences en attente ne partiront jamais. C'est voulu — un déclencheur
             éteint ne tique plus, donc ne périme plus ; sans ce coup de balai elles
             resteraient éternelles, et le seul geste de réparation disponible
             aggraverait la panne ;
           · rallumer → `op=update enabled=true` recalcule `next_due` depuis
             maintenant (`efa0cebc`, #826) : l'échéance figée pendant l'arrêt est
             restée dans le passé, et sans ce recalcul le tick enfilerait à la
             seconde du rallumage — une exécution que personne n'a demandée,
             déclenchée par le geste de quelqu'un qui répare.
           Les deux moitiés vont ensemble : ce qui a attendu pendant l'extinction est
           mort, l'échéance comprise. -->
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
.rt-item { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12.5px; }
.rt-name { font-weight: 600; color: var(--color-ink); }
.rt-cron { font-family: var(--font-mono, monospace); font-size: 11.5px; color: var(--color-mute); }
.rt-next { font-size: 11.5px; color: var(--color-faint); }
.rt-lost { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rt-err { font-size: 12px; color: var(--color-terra, #a8442a); }
.rt-empty { font-size: 13px; line-height: 1.6; }
.rt-effet { font-size: 11.5px; line-height: 1.55; margin: 10px 0 0; }
</style>
