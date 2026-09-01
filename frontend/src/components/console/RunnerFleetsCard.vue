<script setup lang="ts">
// Les FLOTTES : la configuration déclarée d'un passage d'agents, et son état.
//
// Une flotte vivait dans un fichier YAML sur une machine — invisible d'ici, et
// son avancement n'existait que parce qu'une session poussait des messages à une
// autre. Cette carte la LIT. Elle ne déclare rien et ne lance rien : déclarer un
// passage est un dialogue (cible, périmètre, bornes), pas un formulaire — et
// lancer écrit dans le fichier d'un client.
//
// ⚠️ Deux règles que cet écran ne doit jamais enfreindre :
//   1. « aucun travail rattaché » se DIT — il ne s'affiche pas en zéros. Un zéro
//      qui peut vouloir dire « rien trouvé » ou « personne n'a regardé » est le
//      défaut le plus coûteux de ce chantier.
//   2. le budget se compte en JETONS, jamais en monnaie : les tarifs changent et
//      diffèrent par fournisseur. Une conversion affichée ici serait fausse un
//      mois plus tard sans que rien ne le dise.
import { onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import { listRunnerFleets, getRunnerFleetState } from '@/api/console'
import type { RunnerFleet, RunnerFleetState } from '@/types/api.attendu'
import { estResidu, jetons, ton } from '@/lib/runnerFleets'
import { humanize } from '@/lib/errors'
import { absDate } from '@/lib/cellRender'

const fleets = ref<RunnerFleet[]>([])
// Une seule flotte ouverte à la fois : son état vit ici, pas dans une table
// indexée dont chaque lecture serait « peut-être absente ».
const ouverte = ref<number | null>(null)
const etat = ref<RunnerFleetState | null>(null)
const loaded = ref(false)
const error = ref<string | null>(null)

async function load() {
  try {
    fleets.value = (await listRunnerFleets()).fleets
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
  }
}

async function ouvrir(f: RunnerFleet) {
  if (ouverte.value === f.id) { ouverte.value = null; return }
  ouverte.value = f.id
  etat.value = null
  try {
    const { state } = await getRunnerFleetState(f.id)
    // ⚠️ La flotte a pu changer d'ouverture pendant l'appel : ne poser l'état
    // que s'il correspond ENCORE à ce qui est ouvert, sinon on afficherait les
    // mesures d'un passage sous le nom d'un autre.
    if (ouverte.value === f.id) etat.value = state
  } catch (e) {
    error.value = humanize(e)
  }
}

onMounted(load)
</script>

<template>
  <ConsoleCard
    title="Passages d'agents"
    sub="Ce qu'une flotte vise, dans quel périmètre, jusqu'où — et où elle en est."
  >
    <div class="card-body">
      <p v-if="error" class="rf-err">{{ error }}</p>
      <p v-else-if="loaded && !fleets.length" class="dim rf-empty">
        Aucun passage déclaré. Une flotte se déclare en décrivant ce qu'elle vise
        et jusqu'où elle va — c'est ce qui donne un domicile à ses bornes.
      </p>
      <ul v-else class="rf-list">
        <li v-for="f in fleets" :key="f.id" class="rf-item">
          <button class="rf-tete" type="button" @click="ouvrir(f)">
            <span class="rf-nom">{{ f.label || f.procedure }}</span>
            <Tag :tone="ton(f)">{{ f.status }}</Tag>
            <Tag v-if="estResidu(f)" tone="terra">ne bat plus</Tag>
            <span v-if="f.namespace" class="rf-cible">{{ f.namespace }}</span>
            <span v-if="f.model" class="rf-modele">{{ f.model }}</span>
          </button>

          <!-- La raison d'un arrêt est ÉCRITE : sans elle, il faudrait rouvrir
               les journaux pour savoir si le budget a coupé ou si la file s'est
               vidée. -->
          <p v-if="f.stop_reason" class="rf-raison">{{ f.stop_reason }}</p>

          <div v-if="ouverte === f.id" class="rf-etat">
            <p v-if="!etat" class="dim rf-attente">Lecture de l'état…</p>
            <p v-else-if="etat.no_jobs_attached" class="dim rf-vide">
              Aucun travail rattaché à ce passage — il n'a rien enfilé, ou ses
              travaux sont partis sans rattachement.
            </p>
            <dl v-else class="rf-mesures">
              <div><dt>travaux</dt><dd>{{ etat.jobs_total }}</dd></div>
              <div v-if="etat.pending"><dt>en attente</dt><dd>{{ etat.pending }}</dd></div>
              <div v-if="etat.claimed"><dt>en cours</dt><dd>{{ etat.claimed }}</dd></div>
              <div v-if="etat.done"><dt>faits</dt><dd>{{ etat.done }}</dd></div>
              <div v-if="etat.failed" class="alerte"><dt>échoués</dt><dd>{{ etat.failed }}</dd></div>
              <div v-if="etat.abandoned" class="alerte"><dt>abandonnés</dt><dd>{{ etat.abandoned }}</dd></div>
              <div v-if="jetons(etat.usage_tokens)">
                <dt>jetons</dt><dd>{{ jetons(etat.usage_tokens) }}</dd>
              </div>
              <div v-if="jetons(etat.heaviest_row_tokens)">
                <dt>ligne la plus lourde</dt><dd>{{ jetons(etat.heaviest_row_tokens) }}</dd>
              </div>
              <div v-if="etat.last_finished">
                <dt>dernier fini</dt><dd>{{ absDate(etat.last_finished) }}</dd>
              </div>
            </dl>
            <p class="rf-bornes">
              <span v-if="f.max_rows">volume {{ f.max_rows }}</span>
              <span v-if="jetons(f.max_tokens)">budget {{ jetons(f.max_tokens) }} jetons</span>
              <span v-if="jetons(f.max_tokens_per_row)">
                plafond/ligne {{ jetons(f.max_tokens_per_row) }}</span>
              <span v-if="f.workers">{{ f.workers }} agent(s)</span>
            </p>
          </div>
        </li>
      </ul>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.rf-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.rf-item { border-bottom: 1px solid var(--color-hair, #e8e4dd); padding-bottom: 8px; }
.rf-item:last-child { border-bottom: 0; padding-bottom: 0; }
.rf-tete { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; width: 100%;
  background: none; border: 0; padding: 0; cursor: pointer; text-align: left; font-size: 12.5px; }
.rf-nom { font-weight: 600; color: var(--color-ink); }
.rf-cible, .rf-modele { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-mute); }
.rf-raison { margin: 4px 0 0; font-size: 11.5px; color: var(--color-mute); }
.rf-etat { margin-top: 8px; }
.rf-mesures { display: flex; flex-wrap: wrap; gap: 14px; margin: 0; }
.rf-mesures div { display: flex; gap: 5px; align-items: baseline; }
.rf-mesures dt { font-size: 11px; color: var(--color-faint); }
.rf-mesures dd { margin: 0; font-size: 12.5px; font-weight: 600; color: var(--color-ink); }
.rf-mesures .alerte dd { color: var(--color-terra, #a8442a); }
.rf-bornes { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 0;
  font-size: 11px; color: var(--color-faint); }
.rf-vide, .rf-attente { font-size: 12.5px; line-height: 1.6; margin: 0; }
.rf-err { font-size: 12px; color: var(--color-terra, #a8442a); }
.rf-empty { font-size: 13px; line-height: 1.6; }
</style>
