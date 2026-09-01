<script setup lang="ts">
// Bloc « files de travail » de la HOME projet — supervision en un coup d'œil,
// sans naviguer tableau par tableau (le besoin : suivre une campagne depuis un
// téléphone). GÉNÉRIQUE par construction (ADR 0046 : les missions = pure
// config) : tout est DÉRIVÉ — un tableau lié apparaît ssi son schéma déclare un
// field role="status" avec un lifecycle (le critère cockpit exact de
// DatastoreTable), les compteurs viennent de l'aggregate serveur, les baux de
// la file de travail. Zéro notion métier codée ici.
import { computed, onMounted, ref } from 'vue'
import Tag from '../Tag.vue'
import { getNamespaceAggregate, getNamespaceQueue, getNamespaces, getProjectRuns } from '@/api/console'
import type { ProjectRun } from '@/types/api'
import { absDate } from '@/lib/cellRender'
import { bailLigne } from '@/lib/bailDeLigne'

const props = defineProps<{ namespaces: string[]; projectId: number }>()

interface QueueLine {
  nsId: number
  namespace: string
  states: string[]                  // lifecycle d'abord, puis états observés hors déclaration
  counts: Record<string, number>
  total: number
  claimed: number
  expired: number
}

const lines = ref<QueueLine[]>([])
const lastRun = ref<ProjectRun | null>(null)
const loading = ref(true)

type Tone = 'olive' | 'terra' | 'saffron' | 'cobalt' | 'ink'
const OUTCOME_TONE: Record<string, Tone> = { done: 'olive', failed: 'terra', blocked: 'terra' }

onMounted(async () => {
  try {
    const wanted = new Set(props.namespaces)
    const [{ namespaces: all }, runsRes] = await Promise.all([
      getNamespaces(),
      getProjectRuns(props.projectId).catch(() => ({ runs: [] as ProjectRun[] })),
    ])
    lastRun.value = runsRes.runs[0] ?? null
    const candidates = all.filter((n) => {
      if (!wanted.has(n.namespace)) return false
      const sf = (n.schema?.fields ?? []).find((f) => f.role === 'status')
      return !!sf && (sf.lifecycle?.states?.length ?? 0) > 0
    })
    // Best-effort PAR tableau : un tableau en erreur ne vide pas le bloc.
    lines.value = (await Promise.all(candidates.map(async (n) => {
      const sf = (n.schema?.fields ?? []).find((f) => f.role === 'status')!
      try {
        const [{ groups }, queue] = await Promise.all([
          getNamespaceAggregate(n.namespace, { groupBy: sf.key }),
          getNamespaceQueue(n.namespace).catch(() => ({ rows: [] })),
        ])
        const counts: Record<string, number> = {}
        let total = 0
        for (const g of groups) {
          const v = g[sf.key]
          const c = Number(g.count ?? 0)
          counts[v == null || v === '' ? '—' : String(v)] = c
          total += c
        }
        const declared = sf.lifecycle?.states ?? []
        const observed = Object.keys(counts).filter((s) => !declared.includes(s))
        // ⚠️ Lu par `bailLigne`, pas par `Date.parse` : les horodatages arrivent
        // en UTC SANS fuseau, et un parse naïf les prend pour de l'heure LOCALE —
        // deux heures d'écart l'été, donc des baux annoncés expirés à tort. Le
        // même piège avait fait conclure à un ralentissement de campagne qui
        // n'existait pas.
        const now = Date.now()
        const expired = queue.rows.filter((r) => bailLigne(r, now).etat === 'expire').length
        return {
          nsId: n.id, namespace: n.namespace,
          states: [...declared, ...observed], counts, total,
          claimed: queue.rows.length, expired,
        } satisfies QueueLine
      } catch { return null }
    }))).filter((x): x is QueueLine => x !== null)
  } finally {
    loading.value = false
  }
})

const visible = computed(() => !loading.value && lines.value.length > 0)
</script>

<template>
  <div v-if="visible" class="pwq">
    <div class="card-eb">Files de travail</div>
    <div v-if="lastRun" class="pwq-run">
      dernier run ·
      <Tag :tone="lastRun.outcome ? (OUTCOME_TONE[lastRun.outcome] ?? 'cobalt') : 'cobalt'">
        {{ lastRun.outcome ?? 'en cours' }}</Tag>
      <span class="pwq-runlabel">{{ lastRun.label }}</span>
      <span v-if="lastRun.finished_at ?? lastRun.started_at" class="pwq-mute">
        {{ absDate(String(lastRun.finished_at ?? lastRun.started_at)) }}</span>
    </div>
    <div v-for="l in lines" :key="l.nsId" class="pwq-line">
      <RouterLink class="pwq-ns" :to="`/data/${l.nsId}`">{{ l.namespace }}</RouterLink>
      <span class="pwq-total">{{ l.total }}</span>
      <span v-for="s in l.states" :key="s" class="pwq-chip">
        {{ s }} <b>{{ l.counts[s] ?? 0 }}</b></span>
      <Tag v-if="l.claimed" tone="cobalt">{{ l.claimed }} sous bail</Tag>
      <Tag v-if="l.expired" tone="terra" title="le prochain claim recycle ces rows">
        {{ l.expired }} expiré{{ l.expired > 1 ? 's' : '' }}</Tag>
    </div>
  </div>
</template>

<style scoped>
.pwq {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px 16px; margin-top: 12px;
  border: 1px solid var(--color-hair-soft); border-radius: var(--radius-card, 10px);
  background: var(--color-paper-2);
}
.pwq-run { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--color-mute); }
.pwq-runlabel { font-weight: 600; color: var(--color-ink); }
.pwq-mute { color: var(--color-faint); font-size: 11px; }
.pwq-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
.pwq-ns { font-weight: 600; color: var(--color-ink); text-decoration: none; }
.pwq-ns:hover { color: var(--color-cobalt); text-decoration: underline; }
.pwq-total { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-faint); }
.pwq-chip {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-pill, 999px);
  padding: 1px 8px; font-size: 11px; color: var(--color-mute); background: var(--color-surface);
}
.pwq-chip b { font-family: var(--font-mono, monospace); font-weight: 600; color: var(--color-ink); }
</style>
