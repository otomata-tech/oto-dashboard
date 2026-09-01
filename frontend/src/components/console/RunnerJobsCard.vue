<script setup lang="ts">
// File d'exécution des agents hébergés — grain ORDONNANCEUR. Le grain donnée
// (lignes sous bail, états) vit sur la home projet et la page tableau ; ici c'est
// la file de jobs, groupée par flotte.
//
// Refondue le 2026-08-28. Ce qui n'allait pas : une liste plate où CHAQUE ligne
// répétait le nom de la procédure et « worker : ton compte » — sur une campagne,
// cent lignes strictement identiques à l'œil. Principe retenu : ce qui est COMMUN
// monte dans l'en-tête du groupe, ce qui DISTINGUE reste sur la ligne.
//
// Reprise le 2026-09-01, avec l'arrivée de la carte Surveillance et de la fiche
// d'un agent. Trois choses ont bougé, et pour la même raison — dire une chose UNE
// fois, à l'endroit où elle se lit :
//
//   • la synthèse (jetons, médiane, réservations sans écriture) est partie dans
//     Surveillance : deux totaux de la même population sur un même écran, c'est
//     une occasion de se contredire, pas une redondance utile ;
//   • le fil déplié sous la ligne est devenu la fiche du travail : le fil n'était
//     qu'une part de ce qu'il y a à voir, et le déplier poussait le reste de la
//     file hors de l'écran ;
//   • le chargement est passé au magasin partagé — la carte et Surveillance
//     lisaient sinon deux instantanés différents, à 30 s d'écart.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import RunnerJobDetail from './RunnerJobDetail.vue'
import { useRunnerJobs, FENETRE } from '@/composables/useRunnerJobs'
import type { RunnerJob } from '@/api/console'
import { absDate } from '@/lib/cellRender'
import { useMe } from '@/composables/useMe'
import {
  angleMort, aUneGarde, bailExpire, flotteOf, instant, jetons, procOf, renvois,
  sejour, tableauOf, totalGardes,
} from '@/lib/runnerJobs'

const { jobs, loaded, error, maintenant, charger } = useRunnerJobs({ veille: true })

const filtre = ref<RunnerJob['status'] | null>(null)
const ouvert = ref<RunnerJob | null>(null)

const ETATS: Array<RunnerJob['status']> = ['claimed', 'pending', 'done', 'failed']
type Ton = 'olive' | 'terra' | 'saffron' | 'cobalt' | 'ink'
const TONE: Record<RunnerJob['status'], Ton> = {
  pending: 'saffron', claimed: 'cobalt', done: 'olive', failed: 'terra',
}
const LIBELLE: Record<RunnerJob['status'], string> = {
  pending: 'en attente', claimed: 'en cours', done: 'terminé', failed: 'en échec',
}

const { me } = useMe()
// `claimed_by` est le SUB du compte du worker — opaque, il ne se montre pas brut.
// Et « ton compte » sur CHAQUE ligne n'apprend rien : on ne le dit que lorsque le
// worker n'est PAS toi, cas où l'information compte vraiment.
function workerEtranger(j: RunnerJob): string | null {
  if (!j.claimed_by || j.claimed_by === me.value?.sub) return null
  return `${j.claimed_by.slice(0, 8)}…`
}

const visibles = computed(() =>
  filtre.value ? jobs.value.filter((j) => j.status === filtre.value) : jobs.value)

/** Compteurs par état — sur TOUT ce qui est chargé, jamais sur le sous-ensemble
 * filtré : un compteur qui bouge quand on clique dessus ne compte plus rien. */
const compte = computed(() => {
  const c: Record<string, number> = { pending: 0, claimed: 0, done: 0, failed: 0 }
  for (const j of jobs.value) c[j.status] = (c[j.status] ?? 0) + 1
  return c
})

/** Regroupement par flotte : sur une campagne, c'est l'unité qui a un sens.
 * Les jobs sans flotte (déclencheur, reprise à la main) tombent dans un groupe à
 * part plutôt que d'être noyés. */
const groupes = computed(() => {
  const par = new Map<string, RunnerJob[]>()
  for (const j of visibles.value) {
    const cle = flotteOf(j) ?? '(hors flotte)'
    if (!par.has(cle)) par.set(cle, [])
    par.get(cle)!.push(j)
  }
  return [...par.entries()]
    .map(([cle, lot]) => {
      const debuts = lot.map((j) => instant(j.created_at)).filter((t): t is number => t !== null)
      const finis = lot.filter((j) => j.status === 'done')
      const span = debuts.length ? Math.max(...debuts) - Math.min(...debuts) : 0
      return {
        cle,
        flotte: cle === '(hors flotte)' ? null : cle,
        jobs: lot,
        procedures: [...new Set(lot.map(procOf))],
        tableaux: [...new Set(lot.map(tableauOf).filter((n): n is string => !!n))],
        enCours: lot.filter((j) => j.status === 'claimed').length,
        attente: lot.filter((j) => j.status === 'pending').length,
        finis: finis.length,
        echecs: lot.filter((j) => j.status === 'failed').length,
        // Une garde qui a joué dans ce groupe : l'en-tête le dit, sinon il faut
        // parcourir cent lignes pour trouver les deux qui comptent.
        gardes: lot.filter(aUneGarde).length,
        // L'avancement se lit sur les travaux VUS : le volume visé vit dans la
        // déclaration de flotte, que l'API ne rend pas. Mieux vaut un dénominateur
        // vrai et partiel qu'un total supposé — la carte dit d'ailleurs « sur les
        // N derniers travaux » pour qu'on ne le lise pas comme la campagne entière.
        part: lot.length ? Math.round((100 * finis.length) / lot.length) : 0,
        tokens: lot.reduce((s, j) => s + (j.result?.usage_tokens ?? 0), 0),
        // Débit observé : sert à estimer une fin de campagne. Muet sous deux jobs
        // conclus ou sur une fenêtre trop courte — un débit sur un point est faux.
        parHeure: span > 120_000 && finis.length > 1
          ? Math.round((finis.length / span) * 3_600_000) : null,
      }
    })
    .sort((a, b) => (a.flotte === null ? 1 : 0) - (b.flotte === null ? 1 : 0))
})

function setFiltre(s: RunnerJob['status'] | null) {
  filtre.value = filtre.value === s ? null : s
}

// ── Arriver ici depuis une LIGNE ────────────────────────────────────────────
// `_claimed_run` (oto-backend #723) permet à une ligne du datastore de nommer le
// run qui la tient ; ses liens atterrissent sur `/automations?run=<run>` et cette
// carte ouvre le travail correspondant.
//
// ⚠️ Le run peut être HORS de la fenêtre chargée (les N derniers travaux). Dans ce
// cas on le DIT : un écran qui s'ouvre sans rien montrer se lirait « ce run n'a
// jamais existé », alors qu'il est simplement plus vieux que la fenêtre.
const route = useRoute()
const cible = ref<string | null>(null)
const introuvable = ref<string | null>(null)

watch(() => route.query.run, (v) => {
  cible.value = typeof v === 'string' && v ? v : null
  introuvable.value = null
}, { immediate: true })

// La cible est consommée UNE fois : sans ça, refermer la fiche la rouvrirait
// au tick suivant du magasin partagé, et elle deviendrait impossible à fermer.
watch([jobs, cible, loaded], () => {
  const run = cible.value
  if (!run || !loaded.value) return
  const trouve = jobs.value.find((j) => j.run_id === run)
  cible.value = null
  if (trouve) ouvert.value = trouve
  else introuvable.value = run
}, { immediate: true })

defineExpose({ charger })
</script>

<template>
  <ConsoleCard
    title="File d'exécution"
    sub="Les travaux des agents hébergés, groupés par flotte — ouvre-en un pour voir ce qu'il a fait."
  >
    <div class="card-body">
      <!-- Les compteurs SONT les filtres : deux rangées de boutons pour la même
           chose faisaient répéter l'information sans la rendre actionnable. -->
      <div class="rj-bar">
        <button class="rj-chip" :class="{ on: filtre === null }" @click="setFiltre(null)">
          tous <b>{{ jobs.length }}</b>
        </button>
        <button
          v-for="s in ETATS" :key="s" class="rj-chip" :class="[s, { on: filtre === s }]"
          :disabled="!compte[s]" @click="setFiltre(s)"
        >{{ LIBELLE[s] }} <b>{{ compte[s] }}</b></button>
        <Btn kind="mini" @click="charger">Rafraîchir</Btn>
      </div>

      <!-- ⚠️ Venu d'une ligne du datastore, ce run peut être plus vieux que la
           fenêtre. Le taire ferait lire « ce run n'existe pas ». -->
      <p v-if="introuvable" class="rj-notice">
        Le travail du run <span class="mono">{{ introuvable }}</span> n'est pas dans les
        {{ FENETRE }} derniers travaux — il est plus ancien que la fenêtre affichée.
      </p>

      <p v-if="error" class="rj-err">{{ error }}</p>
      <p v-else-if="loaded && !jobs.length" class="dim rj-empty">
        Aucun travail — la file est vide. Les travaux arrivent par une flotte, un
        déclencheur programmé, ou « continuer » sur un run.
      </p>
      <p v-else-if="loaded && !visibles.length" class="dim rj-empty">
        Aucun travail {{ filtre ? LIBELLE[filtre] : '' }} parmi les {{ jobs.length }} derniers.
      </p>

      <div v-for="g in groupes" :key="g.cle" class="rj-groupe">
        <!-- L'en-tête porte ce qui est COMMUN au groupe : la ligne n'a plus à
             répéter cent fois le même nom de procédure. -->
        <div class="rj-gh">
          <span v-if="g.flotte" class="rj-gname">{{ g.flotte }}</span>
          <span v-else class="rj-gname dim">hors flotte</span>
          <span class="rj-gproc">{{ g.procedures.join(', ') }}</span>
          <span v-if="g.tableaux.length === 1" class="rj-gns">{{ g.tableaux[0] }}</span>
          <span class="rj-gstat">
            <span v-if="g.gardes" class="rj-warn">{{ g.gardes }} sous garde · </span>
            <span v-if="g.enCours">{{ g.enCours }} en cours</span>
            <span v-if="g.attente" class="dim"> · {{ g.attente }} en attente</span>
            <span v-if="g.finis"> · {{ g.finis }} conclus</span>
            <span v-if="g.echecs" class="rj-warn"> · {{ g.echecs }} en échec</span>
            <span v-if="g.parHeure" class="dim"> · ~{{ g.parHeure }}/h</span>
            <span v-if="g.tokens" class="dim"> · {{ jetons(g.tokens) }} jetons</span>
          </span>
        </div>
        <!-- L'avancement d'un coup d'œil : un compte sans proportion oblige à
             calculer de tête, et c'est la première chose qu'on cherche. -->
        <div v-if="g.flotte && g.jobs.length > 2" class="rj-jauge"
          :title="`${g.finis} conclus sur ${g.jobs.length} travaux vus`">
          <span class="rj-jauge-in" :style="{ width: g.part + '%' }" />
        </div>

        <ul class="rj-list">
          <li
            v-for="jb in g.jobs" :key="jb.id" class="rj-item"
            :class="{ garde: aUneGarde(jb) }"
          >
            <div class="rj-head">
              <span class="rj-id">#{{ jb.id }}</span>
              <Tag :tone="TONE[jb.status]">{{ LIBELLE[jb.status] }}</Tag>
              <!-- Le signal de garde n'attend pas l'ouverture de la fiche : un
                   travail « terminé » dont la garde a réparé les écritures se
                   range à l'œil avec les succès. -->
              <span v-if="aUneGarde(jb)" class="rj-garde">
                garde · {{ totalGardes(jb) }}</span>
              <!-- ⚠️ Ni succès ni échec : la garde n'a pas pu vérifier ce que ce
                   travail a écrit. Sans ce libellé, il se range avec les vérifiés. -->
              <span v-else-if="angleMort(jb)" class="rj-aveugle"
                title="la garde n'a pas tourné : la ligne travaillée n'a pas pu être identifiée">
                non vérifié</span>
              <!-- Un FAIT servi, pas une présomption d'ancienneté : le bail de la
                   prise est dépassé, le worker est parti, le job est re-claimable. -->
              <span v-if="bailExpire(jb, maintenant)" class="rj-warn"
                title="le prochain passage du harnais reprendra ce travail">bail dépassé</span>
              <span v-if="sejour(jb, maintenant)" class="rj-dur"
                :class="{ vif: jb.status === 'claimed' }">{{ sejour(jb, maintenant) }}</span>
              <span v-if="renvois(jb)" class="rj-renvoi"
                :title="`pris ${jb.attempts} fois sur ${jb.max_attempts}`">
                {{ renvois(jb) }} renvoi{{ renvois(jb) > 1 ? 's' : '' }}</span>
              <span v-if="jetons(jb.result?.usage_tokens)" class="rj-cost">
                {{ jetons(jb.result?.usage_tokens) }} jetons</span>
              <!-- Le tour perdu : réservé, conclu, rien écrit. Aucune erreur n'est
                   levée — sans ce libellé, il passe pour un succès. -->
              <span v-if="jb.result?.faux_depart" class="rj-warn">réservé, rien écrit</span>
              <span v-else-if="jb.result?.writes" class="dim rj-w">
                {{ jb.result.writes }} écriture(s)</span>
              <span v-if="workerEtranger(jb)" class="rj-worker" :title="jb.claimed_by ?? ''">
                worker {{ workerEtranger(jb) }}</span>
              <span class="rj-date" :title="absDate(String(jb.created_at ?? ''))">
                {{ absDate(String(jb.finished_at ?? jb.created_at ?? '')) }}</span>
              <button class="rj-x" @click="ouvert = jb">ouvrir</button>
            </div>
            <p v-if="jb.status === 'failed' && jb.last_error" class="rj-err">
              {{ jb.last_error }} ({{ jb.attempts }}/{{ jb.max_attempts }} tentatives)</p>
          </li>
        </ul>
      </div>

      <p v-if="loaded && jobs.length" class="dim rj-fen">
        Sur les {{ FENETRE }} derniers travaux de l'org — pas sur toute la campagne.
      </p>
    </div>
  </ConsoleCard>

  <RunnerJobDetail :job="ouvert" @close="ouvert = null" />
</template>

<style scoped>
/* `.dim` n'est global que DANS un tableau (`.tbl .dim`) : hors table, la classe
   ne peignait rien et une douzaine de mentions « discrètes » sortaient à la
   couleur d'encre pleine. Elle est donc redéfinie ici, comme dans les autres
   composants de la console. */
.dim { color: var(--color-faint); }

.rj-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 12px; }
.rj-chip {
  font: inherit; font-size: 12px; cursor: pointer; padding: 2px 10px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-pill);
  background: var(--color-surface); color: var(--color-mute);
}
.rj-chip b { font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 600; }
.rj-chip:disabled { opacity: .45; cursor: default; }
.rj-chip.on { border-color: var(--color-saffron); color: var(--color-ink); background: var(--color-saffron-soft, #f7ecd4); }
.rj-warn { color: var(--color-terra-ink); }

.rj-groupe { margin-bottom: 14px; }
.rj-groupe:last-child { margin-bottom: 0; }
.rj-gh {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px;
  padding: 0 2px 6px; border-bottom: 1px solid var(--color-hair); margin-bottom: 8px;
}
.rj-gname { font-weight: 600; font-size: 13px; color: var(--color-ink); }
.rj-gproc { font-size: 12px; color: var(--color-mute); }
.rj-gns { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-faint); }
.rj-gstat { margin-left: auto; font-size: 11.5px; color: var(--color-mute); }
.rj-jauge {
  width: 100%; height: 3px; border-radius: var(--radius-pill);
  background: var(--color-hair); margin: 0 0 8px; overflow: hidden;
}
.rj-jauge-in {
  display: block; height: 100%; background: var(--color-olive, #6b7a3a);
  transition: width var(--t-fast, .2s) var(--ease-out, ease);
}

.rj-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rj-item { border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 7px 10px; }
/* Un travail sous garde se repère dans la file sans être lu ligne à ligne. */
.rj-item.garde { border-color: var(--color-terra-soft); }
.rj-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px; }
.rj-id { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-faint); }
.rj-garde {
  font-size: 11px; font-weight: 600; color: var(--color-terra-ink);
  background: var(--color-terra-soft); border-radius: var(--radius-pill); padding: 1px 8px;
}
.rj-dur { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-mute); }
.rj-dur.vif { color: var(--color-cobalt-ink); }
.rj-renvoi { font-size: 11px; color: var(--color-saffron-ink); }
.rj-cost, .rj-w { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-mute); }
.rj-worker { font-size: 11px; color: var(--color-mute); }
.rj-date { font-size: 11px; color: var(--color-faint); margin-left: auto; }
.rj-x {
  font: inherit; font-size: 12px; border: 0; background: none; cursor: pointer;
  color: var(--color-saffron-ink); font-weight: 600; padding: 0;
}
.rj-x:hover { color: var(--color-ink); }
.rj-err { margin: 6px 0 0; font-size: 12px; color: var(--color-terra-ink); }
.rj-empty { font-size: 13px; line-height: 1.6; }
.rj-fen { margin: 12px 0 0; font-size: 11.5px; }
</style>
