<script setup lang="ts">
// File d'exécution des agents hébergés — la vue « qui tourne, qu'est-ce qui a
// échoué, combien ça coûte », grain ORDONNANCEUR. Le grain donnée (lignes sous
// bail, états) vit sur la home projet et la page tableau ; ici c'est la file
// de jobs elle-même, avec le fil d'un run dépliable au clic.
import { onBeforeUnmount, onMounted, ref } from 'vue'
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

const FILTRES: Array<RunnerJob['status']> = ['pending', 'claimed', 'done', 'failed']
type Tone = 'olive' | 'terra' | 'saffron' | 'cobalt' | 'ink'
const TONE: Record<RunnerJob['status'], Tone> = {
  pending: 'saffron', claimed: 'cobalt', done: 'olive', failed: 'terra',
}
const LIBELLE: Record<RunnerJob['status'], string> = {
  pending: 'en attente', claimed: 'en cours', done: 'terminé', failed: 'en échec',
}

// Fil déplié, par run — chargé AU CLIC (la plupart des lignes ne s'ouvrent pas).
const fil = ref<Record<string, RunThreadMessage[] | 'chargement' | 'erreur'>>({})
const ouvert = ref<string | null>(null)

async function load() {
  loaded.value = false
  error.value = null
  try {
    jobs.value = (await listRunnerJobs(filter.value ?? undefined)).jobs
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
  }
}

function setFilter(s: RunnerJob['status'] | null) {
  filter.value = filter.value === s ? null : s
  void load()
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

function resume(m: RunThreadMessage): string {
  const c = m.content as Record<string, unknown> | null
  const texte = typeof c?.text === 'string' ? c.text : ''
  const appels = Array.isArray(c?.tool_calls)
    ? (c!.tool_calls as Array<{ name?: string }>).map((t) => t.name).filter(Boolean)
    : []
  if (texte && appels.length) return `${texte} → ${appels.join(', ')}`
  if (appels.length) return `outils : ${appels.join(', ')}`
  return texte || '—'
}

function procOf(j: RunnerJob): string {
  return String(j.payload?.procedure ?? (j.kind === 'continue' ? 'reprise de fil' : '?'))
}

// Le `claimed_by` est le SUB du compte du worker (V1 : un worker = ton jeton) —
// un identifiant opaque ne se montre pas brut, il se traduit.
const { me } = useMe()
function workerLabel(j: RunnerJob): string | null {
  if (!j.claimed_by) return null
  return j.claimed_by === me.value?.sub ? 'ton compte' : `${j.claimed_by.slice(0, 8)}…`
}

// Rafraîchissement léger tant que la page est ouverte : un job « en cours »
// figé à l'écran après sa conclusion fait douter de la surveillance elle-même.
let tick: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void load()
  tick = setInterval(() => { void load() }, 30_000)
})
onBeforeUnmount(() => { if (tick) clearInterval(tick) })
defineExpose({ load })
</script>

<template>
  <ConsoleCard
    title="File d'exécution"
    sub="Les runs des agents hébergés — chaque job est un run : son état, son coût, son fil."
  >
    <div class="card-body">
      <div class="rj-bar">
        <button class="rj-chip" :class="{ on: filter === null }" @click="setFilter(null)">tous</button>
        <button v-for="s in FILTRES" :key="s" class="rj-chip" :class="{ on: filter === s }"
          @click="setFilter(s)">{{ LIBELLE[s] }}</button>
        <Btn kind="mini" @click="load">Rafraîchir</Btn>
      </div>

      <p v-if="error" class="rj-err">{{ error }}</p>
      <p v-else-if="loaded && !jobs.length" class="dim rj-empty">
        Aucun job{{ filter ? ` ${LIBELLE[filter]}` : '' }} — la file est vide.
        Les jobs arrivent par une flotte, un déclencheur programmé, ou « continuer » sur un run.
      </p>

      <ul v-else class="rj-list">
        <li v-for="jb in jobs" :key="jb.id" class="rj-item">
          <div class="rj-head">
            <span class="rj-id">#{{ jb.id }}</span>
            <Tag :tone="TONE[jb.status]">{{ LIBELLE[jb.status] }}</Tag>
            <span class="rj-proc">{{ procOf(jb) }}</span>
            <span v-if="workerLabel(jb)" class="rj-worker" :title="jb.claimed_by ?? ''">
              worker : {{ workerLabel(jb) }}</span>
            <span v-if="jb.result?.usage_tokens" class="rj-cost">
              {{ Math.round(jb.result.usage_tokens / 1000) }}k jetons</span>
            <span class="rj-date">{{ absDate(String(jb.finished_at ?? jb.created_at ?? '')) }}</span>
            <button v-if="jb.run_id" class="rj-x" @click="toggleFil(jb.run_id)">
              {{ ouvert === jb.run_id ? 'masquer le fil' : 'voir le fil' }}</button>
          </div>
          <p v-if="jb.status === 'failed' && jb.last_error" class="rj-err">
            {{ jb.last_error }} ({{ jb.attempts }}/{{ jb.max_attempts }} tentatives)</p>

          <div v-if="jb.run_id && ouvert === jb.run_id" class="rj-fil">
            <p v-if="fil[jb.run_id] === 'chargement'" class="dim">chargement…</p>
            <p v-else-if="fil[jb.run_id] === 'erreur'" class="rj-err">
              fil illisible (réservé au propriétaire du run, ou run sans fil)</p>
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
  </ConsoleCard>
</template>

<style scoped>
.rj-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
.rj-chip {
  font: inherit; font-size: 12px; cursor: pointer; padding: 2px 10px;
  border: 1px solid var(--color-hair); border-radius: 999px;
  background: var(--color-surface); color: var(--color-mute);
}
.rj-chip.on { border-color: var(--color-saffron); color: var(--color-ink); background: var(--color-saffron-soft, #f7ecd4); }
.rj-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rj-item { border: 1px solid var(--color-hair); border-radius: 8px; padding: 8px 10px; }
.rj-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px; }
.rj-id { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-faint); }
.rj-proc { font-weight: 600; color: var(--color-ink); }
.rj-worker { font-size: 11px; color: var(--color-mute); }
.rj-cost { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-mute); }
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
