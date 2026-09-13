<script setup lang="ts">
// Déclencheurs programmés du runner — quelle procédure part quand, et le
// robinet enabled. La CRÉATION passe par l'agent (`oto_trigger`) : cette carte
// surveille et coupe/rouvre, elle ne fabrique pas — configurer un cron est un
// dialogue, pas un formulaire. (Le réglage complet arrive avec oto#205, lot 2.)
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { cadenceEnMots } from '@/lib/cadence'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Toggle from './Toggle.vue'
import { listRunnerTriggers, setRunnerTriggerEnabled } from '@/api/console'
import type { RunnerArme, RunnerTrigger } from '@/api/console'
import { inscrireRafraichissement } from '@/composables/useRafraichissement'
import { humanize } from '@/lib/errors'
import { absDate } from '@/lib/cellRender'

// Montée à deux endroits (#860 ①) : la page Automatisations, qui montre l'org
// entière, et l'écran d'UNE procédure, qui ne doit répondre qu'à « celle-ci
// tourne-t-elle ? ». Le filtre est SERVEUR — filtrer côté client devient faux dès
// qu'il y a plus d'une page de déclencheurs.
const props = defineProps<{ procedure?: string }>()
// La présence du runner (`runner`) voyage avec la liste : la page la remonte au
// bandeau au lieu de relire la même route. Sur l'écran d'une procédure, personne
// n'écoute.
const emit = defineEmits<{ runner: [runner: RunnerArme | null]; 'runner-error': [raison: string] }>()
// `tr` et non `t` : le gabarit itère sur les déclencheurs sous le nom `t`.
const { t: tr } = useI18n()

const triggers = ref<RunnerTrigger[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const busy = ref<number | null>(null)
// ⚠️ L'erreur d'un interrupteur appartient à SON déclencheur. Posée sur la carte, elle
// remplaçait toute la liste et ne s'effaçait jamais (constaté oto#205).
const erreurs = ref<Record<number, string>>({})

async function load() {
  try {
    const res = await listRunnerTriggers(props.procedure)
    triggers.value = res.triggers
    error.value = null
    emit('runner', res.runner ?? null)
  } catch (e) {
    error.value = humanize(e)
    emit('runner-error', error.value)
  } finally {
    loaded.value = true
  }
}

async function toggle(t: RunnerTrigger) {
  busy.value = t.id
  const { [t.id]: _ancienne, ...autres } = erreurs.value
  erreurs.value = autres
  try {
    const { trigger } = await setRunnerTriggerEnabled(t.id, !t.enabled)
    Object.assign(t, trigger)
  } catch (e) {
    erreurs.value = { ...erreurs.value, [t.id]: humanize(e) }
  } finally {
    busy.value = null
  }
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
        <li v-for="t in triggers" :key="t.id" class="rt-item">
          <Toggle :on="t.enabled" :disabled="busy === t.id" @click="toggle(t)" />
          <span class="rt-name">{{ t.label || t.procedure }}</span>
          <!-- Le cadencement dans les mots de qui le lit (#860 ②). ⚠️ Quand la forme
               ne se dit pas fidèlement (pas, listes, plages), on RETOMBE sur
               l'expression brute plutôt que d'approximer. -->
          <span class="rt-cron">
            <template v-if="cadenceEnMots(t.cron)">{{ cadenceEnMots(t.cron) }}</template>
            <template v-else>{{ t.cron }}</template>
            · {{ t.tz }}
          </span>
          <Tag v-if="!t.enabled" tone="ink">coupé</Tag>
          <span v-else-if="t.next_due" class="rt-next">
            {{ tr('automations.triggers.next', { date: absDate(t.next_due) }) }}</span>
          <!-- Les occurrences que personne n'est venu prendre avant la suivante : le
               serveur les périme et les COMPTE (`expired_count`, un vrai 0). Un
               déclencheur qui en accumule reste « vert » — il part à l'heure, c'est au
               bout de la file que rien ne vient. -->
          <span v-if="t.expired_count" class="rt-lost">
            <Tag tone="terra">{{ tr('automations.triggers.notTaken', t.expired_count) }}</Tag>
            <!-- Les DEUX dates : « depuis quand » et « est-ce encore en cours » sont
                 deux questions différentes. -->
            <span v-if="t.expired_since" class="rt-next">
              depuis {{ absDate(t.expired_since) }}<template v-if="t.expired_last">,
              dernière {{ absDate(t.expired_last) }}</template></span>
          </span>
          <p v-if="erreurs[t.id]" class="rt-err rt-item-err" role="alert">{{ erreurs[t.id] }}</p>
        </li>
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
.rt-item { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12.5px; }
.rt-name { font-weight: 600; color: var(--color-ink); }
.rt-cron { font-family: var(--font-mono, monospace); font-size: 11.5px; color: var(--color-mute); }
.rt-next { font-size: 11.5px; color: var(--color-faint); }
.rt-lost { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rt-err { font-size: 12px; color: var(--color-terra-ink); }
.rt-item-err { flex-basis: 100%; margin: 0; }
.rt-empty { font-size: 13px; line-height: 1.6; }
.rt-effet { font-size: 11.5px; line-height: 1.55; margin: 10px 0 0; }
</style>
