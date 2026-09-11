<script setup lang="ts">
// Bloc « files de travail » de la HOME projet — supervision en un coup d'œil,
// sans naviguer tableau par tableau (le besoin : suivre une campagne depuis un
// téléphone). GÉNÉRIQUE par construction (ADR 0046 : les missions = pure
// config) : tout est DÉRIVÉ — un tableau lié apparaît ssi son schéma déclare un
// field role="status" avec un lifecycle (le critère cockpit exact de
// DatastoreTable), les compteurs viennent de l'aggregate serveur, les baux de
// la file de travail. Zéro notion métier codée ici. Un lien que le serveur n'a pas
// su rattacher à un tableau apparaît aussi, nommé, sans compteurs (cf. `nonResolus`).
import { computed, onMounted, ref } from 'vue'
import Tag from '../Tag.vue'
import { getNamespaceAggregate, getNamespaceQueue, getNamespaces, getProjectRuns, getSharedWithMe } from '@/api/console'
import type { ProjectLink, ProjectRun } from '@/types/api'
import { absDate } from '@/lib/cellRender'
import { bailLigne } from '@/lib/bailDeLigne'
import { abandonState, claimBudget, maxClaims } from '@/lib/datastoreClaims'

// Les liens `tableau` du projet, TELS QUE LE SERVEUR LES SERT. On en lit l'ADRESSE,
// `datastore_id` — résolue dans la portée du PROPRIÉTAIRE du projet (backend v1.262.0),
// donc la même pour tous les lecteurs —, jamais le nom : à nom égal, la résolution
// préfère le tableau PERSONNEL de celui qui regarde, et ce bloc comptait alors les
// lignes du sien sous le libellé du tableau du projet (oto#160).
const props = defineProps<{ links: ProjectLink[]; projectId: number }>()

interface QueueLine {
  nsId: number
  datastore: string
  states: string[]                  // lifecycle d'abord, puis états observés hors déclaration
  counts: Record<string, number>
  total: number
  claimed: number
  expired: number
  // Le plafond de réservations sans écriture du tableau (oto-backend#433) : ce qui
  // sort une ligne de la file toute seule. Sans lui affiché, une campagne pouvait
  // fondre sans qu'aucun compteur de cette page ne dise pourquoi.
  ceiling: number | null            // lifecycle.max_claims, null = aucun plafond
  abandonState: string | null       // lifecycle.abandon_state, l'état où le plafond verse
  atCeiling: number                 // lignes sous bail déjà au plafond
}

const lines = ref<QueueLine[]>([])
// Les liens SANS identifiant servi : le serveur n'a désigné aucun tableau (supprimé, ou
// un nom qu'il ne rattache à aucun dans la portée du projet). On ne les résout pas ici —
// ce serait les résoudre chez le lecteur, donc refaire le défaut. On les nomme, sans
// compteurs, et on dit le geste qui répare.
const nonResolus = ref<string[]>([])
const lastRun = ref<ProjectRun | null>(null)
const loading = ref(true)

type Tone = 'olive' | 'terra' | 'saffron' | 'cobalt' | 'ink'
const OUTCOME_TONE: Record<string, Tone> = { done: 'olive', failed: 'terra', blocked: 'terra' }

onMounted(async () => {
  try {
    const ids = new Set(props.links.flatMap((l) => (l.datastore_id != null ? [l.datastore_id] : [])))
    nonResolus.value = props.links.filter((l) => l.datastore_id == null)
      .map((l) => l.datastore ?? l.target_ref)
    // LES DEUX listes, comme le repli de `DatastoreTable` : `getNamespaces()` exclut à
    // dessein les partages NOMINATIFS, et un tableau reçu lié au projet n'aurait jamais
    // eu de compteurs. Elles ne se recoupent pas (le serveur ôte de la seconde ce que la
    // première rend) : aucun tableau n'y est compté deux fois.
    const [{ datastores: propres }, { datastores: recus }, runsRes] = await Promise.all([
      getNamespaces(),
      getSharedWithMe(),
      getProjectRuns(props.projectId).catch(() => ({ runs: [] as ProjectRun[] })),
    ])
    lastRun.value = runsRes.runs[0] ?? null
    const candidates = [...propres, ...recus].filter((n) => {
      if (!ids.has(n.id)) return false
      const sf = (n.schema?.fields ?? []).find((f) => f.role === 'status')
      return !!sf && (sf.lifecycle?.states?.length ?? 0) > 0
    })
    // Best-effort PAR tableau : un tableau en erreur ne vide pas le bloc.
    lines.value = (await Promise.all(candidates.map(async (n) => {
      const sf = (n.schema?.fields ?? []).find((f) => f.role === 'status')!
      try {
        // ⚠️ On adresse par l'IDENTIFIANT, jamais par `n.datastore` — et `n` a été
        // CHOISI par l'identifiant du lien, plus haut. Les deux moitiés comptent :
        // adresser par l'id d'une entrée choisie par le nom comptait quand même
        // l'homonyme à soi, sous le libellé du tableau du projet.
        const ref = String(n.id)
        const [{ groups }, queue] = await Promise.all([
          getNamespaceAggregate(ref, { groupBy: sf.key }),
          getNamespaceQueue(ref).catch(() => ({ rows: [] })),
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
          nsId: n.id, datastore: n.datastore,
          states: [...declared, ...observed], counts, total,
          claimed: queue.rows.length, expired,
          ceiling: maxClaims(sf.lifecycle),
          abandonState: abandonState(sf.lifecycle),
          atCeiling: queue.rows.filter((r) => claimBudget(r, sf.lifecycle)?.atCeiling).length,
        } satisfies QueueLine
      } catch { return null }
    }))).filter((x): x is QueueLine => x !== null)
  } finally {
    loading.value = false
  }
})

const visible = computed(() => !loading.value && (lines.value.length > 0 || nonResolus.value.length > 0))
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
      <RouterLink class="pwq-ns" :to="`/data/${l.nsId}`">{{ l.datastore }}</RouterLink>
      <span class="pwq-total">{{ l.total }}</span>
      <span v-for="s in l.states" :key="s" class="pwq-chip"
        :class="{ abandon: !!l.abandonState && s === l.abandonState }"
        :title="s === l.abandonState
          ? `état d'abandon : la plateforme y verse une ligne à bout de réservations sans écriture`
          : undefined">
        {{ s }} <b>{{ l.counts[s] ?? 0 }}</b></span>
      <Tag v-if="l.claimed" tone="cobalt">{{ l.claimed }} sous bail</Tag>
      <Tag v-if="l.expired" tone="terra" title="le prochain claim recycle ces rows">
        {{ l.expired }} expiré{{ l.expired > 1 ? 's' : '' }}</Tag>
      <Tag v-if="l.atCeiling" tone="terra"
        title="sortie de la file à la prochaine libération sans écriture">
        {{ l.atCeiling }} au plafond</Tag>
      <span v-if="l.ceiling" class="pwq-mute">plafond {{ l.ceiling }}</span>
    </div>
    <!-- Ni lien ni compteur : sans identifiant, les deux ne sauraient viser que le
         tableau du LECTEUR. La phrase est celle de la vue du lien (ProjectViewer). -->
    <div v-for="(nom, i) in nonResolus" :key="`sans-id:${i}`" class="pwq-line">
      <span class="pwq-ns">{{ nom }}</span>
      <span class="pwq-mute">aucun tableau résolu pour ce lien — relie-le à nouveau pour le fixer sur un tableau précis</span>
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
/* L'état d'abandon n'est pas un état métier : c'est là que le plafond verse. */
.pwq-chip.abandon { border-color: var(--color-terra-soft); color: var(--color-terra-ink); }
</style>
