<script setup lang="ts">
// File d'exécution des agents hébergés — grain ORDONNANCEUR. Le grain donnée
// (lignes sous bail, états) vit sur la home projet et la page tableau ; ici c'est
// la file de jobs, avec le fil d'un run dépliable au clic.
//
// Refondue le 2026-08-28. Ce qui n'allait pas : une liste plate où CHAQUE ligne
// répétait le nom de la procédure et « worker : ton compte » — sur une campagne,
// cent lignes strictement identiques à l'œil, où l'on cherchait en vain ce qui les
// distingue. Trois manques rendaient la surveillance impossible : pas de vue
// d'ensemble (combien tourne, combien ça coûte), pas de regroupement par flotte
// alors que le job PORTE sa flotte, et pas de durée — or « en cours depuis 2 min »
// et « en cours depuis 40 min » demandent deux réactions opposées.
//
// Principe retenu : ce qui est COMMUN monte dans l'en-tête du groupe, ce qui
// DISTINGUE reste sur la ligne. Une ligne ne porte que ce qui lui est propre.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import { getRunThread, listRunnerJobs } from '@/api/console'
import type { RunnerJob, RunThreadMessage } from '@/api/console'
import { humanize } from '@/lib/errors'
import { absDate } from '@/lib/cellRender'
import { useMe } from '@/composables/useMe'

const jobs = ref<RunnerJob[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const filter = ref<RunnerJob['status'] | null>(null)
// L'horloge du composant : recalculée au tick, pour que les durées « en cours »
// avancent à l'écran au lieu de se figer au chargement.
const maintenant = ref(Date.now())

const ETATS: Array<RunnerJob['status']> = ['claimed', 'pending', 'done', 'failed']
type Tone = 'olive' | 'terra' | 'saffron' | 'cobalt' | 'ink'
const TONE: Record<RunnerJob['status'], Tone> = {
  pending: 'saffron', claimed: 'cobalt', done: 'olive', failed: 'terra',
}
const LIBELLE: Record<RunnerJob['status'], string> = {
  pending: 'en attente', claimed: 'en cours', done: 'terminé', failed: 'en échec',
}

// ⚠️ Les horodatages arrivent en UTC SANS fuseau (« 2026-08-28 13:53:53 »).
// `Date.parse` les lirait comme heure LOCALE : un job de l'instant s'afficherait
// « il y a 2 h » l'été. On force le fuseau avant de parser.
function instant(v: unknown): number | null {
  if (!v) return null
  const s = String(v)
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : s.replace(' ', 'T') + 'Z'
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

function duree(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

/** Depuis combien de temps ce job tourne, ou combien il a duré. */
function ecoule(j: RunnerJob): string | null {
  const debut = instant(j.created_at)
  if (debut === null) return null
  const fin = instant(j.finished_at) ?? maintenant.value
  return duree(Math.max(0, fin - debut))
}

function jetons(n: number | undefined): string | null {
  if (!n) return null
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

const { me } = useMe()
// `claimed_by` est le SUB du compte du worker — opaque, il ne se montre pas brut.
// Et « ton compte » sur CHAQUE ligne n'apprend rien : on ne le dit que lorsque le
// worker n'est PAS toi, cas où l'information compte vraiment.
function workerEtranger(j: RunnerJob): string | null {
  if (!j.claimed_by || j.claimed_by === me.value?.sub) return null
  return `${j.claimed_by.slice(0, 8)}…`
}

function procOf(j: RunnerJob): string {
  return String(j.payload?.procedure ?? (j.kind === 'continue' ? 'reprise de fil' : '—'))
}
function flotteOf(j: RunnerJob): string | null {
  const f = j.payload?.fleet
  return typeof f === 'string' && f ? f : null
}
function tableauOf(j: RunnerJob): string | null {
  const n = j.payload?.namespace
  return typeof n === 'string' && n ? n : null
}

const visibles = computed(() =>
  filter.value ? jobs.value.filter((j) => j.status === filter.value) : jobs.value)

/** Compteurs par état — sur TOUT ce qui est chargé, jamais sur le sous-ensemble
 * filtré : un compteur qui bouge quand on clique dessus ne compte plus rien. */
const compte = computed(() => {
  const c: Record<string, number> = { pending: 0, claimed: 0, done: 0, failed: 0 }
  for (const j of jobs.value) c[j.status] = (c[j.status] ?? 0) + 1
  return c
})

const synthese = computed(() => {
  const finis = jobs.value.filter((j) => j.status === 'done')
  const tok = jobs.value.reduce((s, j) => s + (j.result?.usage_tokens ?? 0), 0)
  const cache = jobs.value.reduce((s, j) => s + (j.result?.usage_cache_read ?? 0), 0)
  const durees = finis
    .map((j) => {
      const a = instant(j.created_at); const b = instant(j.finished_at)
      return a !== null && b !== null ? b - a : null
    })
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)
  // Réservations sans écriture : l'agent a pris une ligne et conclu sans rien
  // écrire. Aucune erreur n'est levée — c'est le seul endroit où ça se voit.
  const perdus = finis.filter((j) => j.result?.faux_depart).length
  return {
    tokens: tok,
    cache,
    mediane: durees[Math.floor(durees.length / 2)] ?? null,
    perdus,
    finis: finis.length,
  }
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
        // L'avancement se lit sur les travaux VUS : le volume visé vit dans la
        // déclaration de flotte, que l'API ne rend pas. Mieux vaut un dénominateur
        // vrai et partiel qu'un total supposé — la carte dit d'ailleurs « sur les
        // N derniers jobs » pour qu'on ne le lise pas comme la campagne entière.
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

// Fil déplié, par run — chargé AU CLIC (la plupart des lignes ne s'ouvrent pas).
const fil = ref<Record<string, RunThreadMessage[] | 'chargement' | 'erreur'>>({})
const ouvert = ref<string | null>(null)

async function load() {
  error.value = null
  try {
    // Chargé SANS filtre d'état : le tri se fait ici, et les compteurs portent
    // ainsi sur la même population quel que soit le filtre affiché.
    jobs.value = (await listRunnerJobs(undefined, 120)).jobs
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
    maintenant.value = Date.now()
  }
}

function setFilter(s: RunnerJob['status'] | null) {
  filter.value = filter.value === s ? null : s
}

async function toggleFil(runId: string) {
  if (ouvert.value === runId) { ouvert.value = null; return }
  ouvert.value = runId
  if (fil.value[runId] && fil.value[runId] !== 'erreur') return
  fil.value[runId] = 'chargement'
  try {
    fil.value[runId] = (await getRunThread(runId)).messages
  } catch {
    fil.value[runId] = 'erreur'
  }
}

// ⚠️ Le tour est apposé sous `content`, PAS sous `text` — la vue lisait la mauvaise
// clé et affichait « — » sur chaque ligne d'un fil pourtant plein (constaté le
// 2026-08-28 sur une campagne réelle). On accepte les deux formes : le chemin
// stateless appose du `text`, celui qui délègue la boucle au fournisseur appose du
// `content` accompagné d'un relevé d'outils.
function resume(m: RunThreadMessage): string {
  const c = m.content as Record<string, unknown> | null
  const brut = c?.content ?? c?.text
  const texte = typeof brut === 'string' ? brut : ''
  const appels = Array.isArray(c?.tool_calls)
    ? (c!.tool_calls as Array<{ name?: string }>).map((t) => t.name).filter(Boolean)
    : []
  const releve = typeof c?.tool_relevé === 'string' ? c.tool_relevé : ''
  const outils = appels.length ? appels.join(', ') : releve
  if (texte && outils) return `${texte}\n↳ ${outils}`
  if (outils) return `outils : ${outils}`
  return texte || '—'
}

// Rafraîchissement léger tant que la page est ouverte : un job « en cours » figé
// à l'écran après sa conclusion fait douter de la surveillance elle-même. Les
// durées, elles, avancent chaque seconde sans rappeler le serveur.
let tick: ReturnType<typeof setInterval> | null = null
let horloge: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void load()
  tick = setInterval(() => { void load() }, 30_000)
  horloge = setInterval(() => { maintenant.value = Date.now() }, 1_000)
})
onBeforeUnmount(() => {
  if (tick) clearInterval(tick)
  if (horloge) clearInterval(horloge)
})
defineExpose({ load })
</script>

<template>
  <ConsoleCard
    title="File d'exécution"
    sub="Les runs des agents hébergés — chaque job est un run : son état, son coût, son fil."
  >
    <div class="card-body">
      <!-- Les compteurs SONT les filtres : deux rangées de boutons pour la même
           chose faisaient répéter l'information sans la rendre actionnable. -->
      <div class="rj-bar">
        <button class="rj-chip" :class="{ on: filter === null }" @click="setFilter(null)">
          tous <b>{{ jobs.length }}</b>
        </button>
        <button
          v-for="s in ETATS" :key="s" class="rj-chip" :class="[s, { on: filter === s }]"
          :disabled="!compte[s]" @click="setFilter(s)"
        >{{ LIBELLE[s] }} <b>{{ compte[s] }}</b></button>
        <Btn kind="mini" @click="load">Rafraîchir</Btn>
      </div>

      <p v-if="loaded && jobs.length" class="rj-tot">
        <span v-if="synthese.tokens">{{ jetons(synthese.tokens) }} jetons facturés</span>
        <span v-if="synthese.cache" class="dim">
          · {{ jetons(synthese.cache) }} lus en cache</span>
        <span v-if="synthese.mediane !== null">
          · {{ duree(synthese.mediane) }} par run (médiane)</span>
        <span v-if="synthese.perdus" class="rj-warn">
          · {{ synthese.perdus }} réservation(s) sans écriture</span>
        <span class="dim"> · sur les {{ jobs.length }} derniers jobs</span>
      </p>

      <p v-if="error" class="rj-err">{{ error }}</p>
      <p v-else-if="loaded && !jobs.length" class="dim rj-empty">
        Aucun job — la file est vide. Les jobs arrivent par une flotte, un
        déclencheur programmé, ou « continuer » sur un run.
      </p>
      <p v-else-if="loaded && !visibles.length" class="dim rj-empty">
        Aucun job {{ filter ? LIBELLE[filter] : '' }} parmi les {{ jobs.length }} derniers.
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
          <li v-for="jb in g.jobs" :key="jb.id" class="rj-item">
            <div class="rj-head">
              <span class="rj-id">#{{ jb.id }}</span>
              <Tag :tone="TONE[jb.status]">{{ LIBELLE[jb.status] }}</Tag>
              <span v-if="ecoule(jb)" class="rj-dur"
                :class="{ vif: jb.status === 'claimed' }">{{ ecoule(jb) }}</span>
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
              <button v-if="jb.run_id" class="rj-x" @click="toggleFil(jb.run_id)">
                {{ ouvert === jb.run_id ? 'masquer le fil' : 'voir le fil' }}</button>
            </div>
            <p v-if="jb.status === 'failed' && jb.last_error" class="rj-err">
              {{ jb.last_error }} ({{ jb.attempts }}/{{ jb.max_attempts }} tentatives)</p>

            <div v-if="jb.run_id && ouvert === jb.run_id" class="rj-fil">
              <p v-if="fil[jb.run_id] === 'chargement'" class="dim">chargement…</p>
              <p v-else-if="fil[jb.run_id] === 'erreur'" class="rj-err">
                fil illisible (réservé au propriétaire du run, ou run sans fil)</p>
              <!-- Un fil vide n'est pas une panne : quand la boucle d'outils tourne
                   chez le fournisseur, le verbatim des tours ne nous revient pas.
                   Sans cette phrase, le dépliant semble cassé. -->
              <p v-else-if="!(fil[jb.run_id] as RunThreadMessage[]).length" class="dim">
                Aucun tour conservé pour ce run — les runs dont la boucle d'outils
                s'exécute chez le fournisseur ne rendent qu'une synthèse.
              </p>
              <template v-else>
                <div v-for="m in (fil[jb.run_id] as RunThreadMessage[])" :key="m.seq"
                  class="rj-msg" :data-role="m.role">
                  <span class="rj-role">{{ m.role }}</span>
                  <span class="rj-txt">{{ resume(m) }}</span>
                </div>
              </template>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.rj-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
.rj-chip {
  font: inherit; font-size: 12px; cursor: pointer; padding: 2px 10px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-pill);
  background: var(--color-surface); color: var(--color-mute);
}
.rj-chip b { font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 600; }
.rj-chip:disabled { opacity: .45; cursor: default; }
.rj-chip.on { border-color: var(--color-saffron); color: var(--color-ink); background: var(--color-saffron-soft, #f7ecd4); }
.rj-tot { margin: 0 0 12px; font-size: 12px; color: var(--color-mute); }
.rj-tot span + span { margin-left: 2px; }
.rj-warn { color: var(--color-terra, #a8442a); }

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
.rj-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px; }
.rj-id { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-faint); }
.rj-dur { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-mute); }
.rj-dur.vif { color: var(--color-cobalt, #2456c4); }
.rj-cost, .rj-w { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-mute); }
.rj-worker { font-size: 11px; color: var(--color-mute); }
.rj-date { font-size: 11px; color: var(--color-faint); margin-left: auto; }
.rj-x {
  font: inherit; font-size: 12px; border: 0; background: none; cursor: pointer;
  color: var(--color-cobalt, #2456c4); padding: 0;
}
.rj-fil {
  margin-top: 8px; padding: 8px 10px; border-left: 2px solid var(--color-hair);
  display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto;
}
.rj-msg { display: flex; gap: 8px; font-size: 12px; }
.rj-role { flex: 0 0 60px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint); }
.rj-msg[data-role='assistant'] .rj-txt { color: var(--color-ink); }
.rj-txt { color: var(--color-mute); white-space: pre-wrap; word-break: break-word; }
.rj-err { margin: 6px 0 0; font-size: 12px; color: var(--color-terra, #a8442a); }
.rj-empty { font-size: 13px; line-height: 1.6; }
</style>
