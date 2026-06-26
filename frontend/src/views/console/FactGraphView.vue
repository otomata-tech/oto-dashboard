<script setup lang="ts">
// Vue « Fact graph » (ADR 0008/0018) — rendu SCHEMA-AWARE du substrat typé.
// Le datastore (table brute) reste pour le libre ; ici chaque kind porte un schéma
// (rôles de champ via describe_kinds) → on rend des FICHES lisibles : titre, badges,
// métriques, et surtout les champs de QUALIFICATION en texte complet (≠ tronqué).
// Remplace le cockpit scout spécifique par une surface générique, un thème = un kind.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import { getFactKinds, getFacts } from '@/api/console'
import type { FactKind, FactRow } from '@/types/api'
import { humanize } from '@/lib/errors'

const kinds = ref<FactKind[]>([])
const selectedKind = ref<string | null>(null)
const facts = ref<FactRow[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)
const factsLoading = ref(false)

const currentKind = computed(() => kinds.value.find((k) => k.kind === selectedKind.value) || null)

// rôle → noms de champ (lus du schéma du kind courant)
function roleNames(role: string): string[] {
  return (currentKind.value?.fields ?? []).filter((f) => f.role === role).map((f) => f.name)
}
// titre : rôle `title`, sinon repli sur un champ « nom » courant, sinon #id.
const TITLE_FALLBACK = ['raison_sociale', 'nom', 'titre', 'title', 'numero', 'libelle', 'label']
const titleField = computed(() => {
  const fs = currentKind.value?.fields ?? []
  const byRole = fs.find((f) => f.role === 'title')
  if (byRole) return byRole.name
  return TITLE_FALLBACK.find((n) => fs.some((f) => f.name === n)) ?? null
})
const statusField = computed(() => roleNames('status')[0] ?? null)
const priorityField = computed(() => roleNames('priority')[0] ?? null)
const badgeFields = computed(() => roleNames('badge'))
const metricFields = computed(() => roleNames('metric'))
const subtitleFields = computed(() => [...roleNames('subtitle'), ...roleNames('meta')])
const contactFields = computed(() => [...roleNames('contact'), ...roleNames('link')])
const qualifFields = computed(() =>
  (currentKind.value?.fields ?? []).filter((f) => f.role === 'qualif' || f.role === 'note'),
)
// champs SANS rôle de rendu (kinds legacy : entreprise/contact/action/compta) →
// rendus génériquement en clé:valeur pour qu'aucune fiche ne soit vide.
const KNOWN_ROLES = new Set([
  'title', 'subtitle', 'meta', 'badge', 'metric', 'status', 'priority', 'contact', 'link', 'qualif', 'note',
])
const genericFields = computed(() =>
  (currentKind.value?.fields ?? []).filter(
    (f) => !KNOWN_ROLES.has(f.role ?? '') && f.name !== titleField.value,
  ),
)

function labelOf(name: string): string {
  return currentKind.value?.fields.find((f) => f.name === name)?.label ?? name
}
function str(v: unknown): string { return v == null ? '' : String(v) }
function num(v: unknown): string {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('fr-FR') : String(v)
}
function present(f: FactRow, name: string): boolean {
  const v = f.data[name]
  return v != null && v !== ''
}

// tri par priorité décroissante quand le champ existe
const sortedFacts = computed(() => {
  const pf = priorityField.value
  if (!pf) return facts.value
  return [...facts.value].sort((a, b) => Number(b.data[pf] ?? 0) - Number(a.data[pf] ?? 0))
})

// board : colonnes groupées par statut (sinon une seule colonne)
const columns = computed(() => {
  const sf = statusField.value
  if (!sf) return [{ key: '', label: 'tous', items: sortedFacts.value }]
  const groups = new Map<string, FactRow[]>()
  for (const f of sortedFacts.value) {
    const k = str(f.data[sf]) || '—'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(f)
  }
  return [...groups.entries()].map(([key, items]) => ({ key, label: key, items }))
})

const STATUS_TONE: Record<string, 'olive' | 'saffron' | 'terra' | 'cobalt' | 'ink'> = {
  nouveau: 'cobalt', qualifie: 'olive', rdv: 'olive', contacte: 'saffron',
  perdu: 'terra', mort: 'terra', dead: 'terra',
}
function statusTone(s: string): 'olive' | 'saffron' | 'terra' | 'cobalt' | 'ink' {
  return STATUS_TONE[s.toLowerCase()] ?? 'ink'
}

async function loadKinds() {
  try {
    kinds.value = (await getFactKinds()).kinds
    // défaut : le 1er kind « riche » (avec des champs de qualif = une vraie fiche), sinon le 1er
    const rich = kinds.value.find((k) => k.fields.some((f) => f.role === 'qualif'))
    selectedKind.value = (rich ?? kinds.value[0])?.kind ?? null
    if (selectedKind.value) await loadFacts()
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}

async function selectKind(k: string) {
  if (k === selectedKind.value) return
  selectedKind.value = k
  await loadFacts()
}

async function loadFacts() {
  if (!selectedKind.value) return
  factsLoading.value = true
  error.value = null
  try { facts.value = (await getFacts(selectedKind.value)).facts }
  catch (e) { error.value = humanize(e); facts.value = [] }
  finally { factsLoading.value = false }
}

onMounted(loadKinds)
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="fg-layout">
      <!-- sélecteur de kind (= thème de fiche) -->
      <ConsoleCard title="kinds" flush sub="typed records — pick a theme to view its cards.">
        <div class="rowlist">
          <button v-for="k in kinds" :key="k.kind"
            class="rowitem fg-kind" :class="{ active: k.kind === selectedKind }"
            @click="selectKind(k.kind)">
            <code class="mono" style="font-weight: 600">{{ k.kind }}</code>
            <Tag tone="ink">{{ k.domain }}</Tag>
          </button>
          <div v-if="loaded && !kinds.length" class="dim" style="text-align: center; padding: 16px">
            no kinds declared.
          </div>
        </div>
      </ConsoleCard>

      <!-- board des facts du kind sélectionné -->
      <ConsoleCard v-if="currentKind" :title="currentKind.kind" flush
        :sub="factsLoading ? 'loading…' : `${facts.length} fiche${facts.length === 1 ? '' : 's'}`">
        <div v-if="!factsLoading && !facts.length" class="dim" style="text-align: center; padding: 24px">
          aucune fiche — tes agents en créent avec
          <code style="font-size: 11px">fact_write("{{ currentKind.kind }}", fields)</code>.
        </div>

        <div v-else class="fg-board">
          <div v-for="col in columns" :key="col.key" class="fg-col">
            <div class="fg-col-head">
              <Tag :tone="statusTone(col.label)">{{ col.label }}</Tag>
              <span class="dim">{{ col.items.length }}</span>
            </div>

            <article v-for="f in col.items" :key="f.id" class="fg-card">
              <!-- titre + priorité -->
              <div class="fg-card-top">
                <h4 class="fg-title">{{ str(titleField ? f.data[titleField] : ('#' + f.id)) }}</h4>
                <Tag v-if="priorityField && present(f, priorityField)" tone="saffron">
                  P{{ str(f.data[priorityField]) }}
                </Tag>
              </div>

              <!-- sous-titre (ville / cp …) -->
              <div v-if="subtitleFields.some((n) => present(f, n))" class="fg-sub dim">
                {{ subtitleFields.filter((n) => present(f, n)).map((n) => str(f.data[n])).join(' · ') }}
              </div>

              <!-- badges (naf, effectif, émetteur en place…) -->
              <div v-if="badgeFields.some((n) => present(f, n))" class="fg-badges">
                <Tag v-for="n in badgeFields.filter((n) => present(f, n))" :key="n" tone="cobalt">
                  {{ labelOf(n) }}: {{ str(f.data[n]) }}
                </Tag>
              </div>

              <!-- métriques (CA…) -->
              <div v-if="metricFields.some((n) => present(f, n))" class="fg-metrics">
                <span v-for="n in metricFields.filter((n) => present(f, n))" :key="n" class="fg-metric">
                  <span class="dim">{{ labelOf(n) }}</span> <b>{{ num(f.data[n]) }}</b>
                </span>
              </div>

              <!-- contact / lien -->
              <div v-for="n in contactFields.filter((n) => present(f, n))" :key="n" class="fg-contact">
                <span class="dim">{{ labelOf(n) }}:</span> {{ str(f.data[n]) }}
              </div>

              <!-- QUALIFICATION : texte libre en bloc complet (le gain de lisibilité) -->
              <div v-for="qf in qualifFields" :key="qf.name" v-show="present(f, qf.name)" class="fg-qualif">
                <div class="fg-qualif-label">{{ qf.label }}</div>
                <p class="fg-qualif-text">{{ str(f.data[qf.name]) }}</p>
              </div>

              <!-- champs sans rôle (kinds legacy) : rendu générique clé:valeur -->
              <div v-if="genericFields.some((gf) => present(f, gf.name))" class="fg-generic">
                <span v-for="gf in genericFields.filter((gf) => present(f, gf.name))" :key="gf.name" class="fg-gen">
                  <span class="dim">{{ gf.label }}:</span> {{ str(f.data[gf.name]) }}
                </span>
              </div>
            </article>
          </div>
        </div>
      </ConsoleCard>
    </div>

    <ConsoleCard title="how agents use this" sub="typed substrate — not the free datastore.">
      <div class="helptext" style="font-size: 12.5px; line-height: 1.65">
        <code style="font-size: 11px">fact_kinds()</code> lists the typed record kinds + their schema ·
        <code style="font-size: 11px">fact_write("lead", fields)</code> creates/updates a typed fiche
        (validated) · agents must fill the <b>qualification</b> fields (pourquoi, accroche, next step,
        notes), not only the data. The card above renders straight from the kind's schema.
      </div>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.fg-layout {
  display: grid;
  grid-template-columns: minmax(200px, 240px) 1fr;
  gap: var(--gap, 16px);
  align-items: start;
}
@media (max-width: 720px) {
  .fg-layout { grid-template-columns: 1fr; }
}
.fg-kind {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-inline: var(--pad-card);
  background: none; border: 0; text-align: left; cursor: pointer; font: inherit; color: inherit;
}
.fg-kind.active { background: var(--color-paper-3); }

.fg-board {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 4px 12px 12px;
  align-items: start;
}
.fg-col {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fg-col-head {
  display: flex; align-items: center; justify-content: space-between;
  position: sticky; top: 0;
  padding-bottom: 2px;
}
.fg-card {
  border: 1px solid var(--color-hair);
  border-radius: 10px;
  background: var(--color-paper);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fg-card-top { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
.fg-title { margin: 0; font-size: 14px; font-weight: 650; line-height: 1.3; }
.fg-sub { font-size: 12px; }
.fg-badges { display: flex; flex-wrap: wrap; gap: 4px; }
.fg-metrics { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12.5px; }
.fg-contact { font-size: 12.5px; }
.fg-qualif {
  border-top: 1px dashed var(--color-hair);
  padding-top: 6px;
}
.fg-qualif-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--color-ink-soft);
  margin-bottom: 2px;
}
.fg-qualif-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.fg-generic { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12.5px; }
.fg-gen { white-space: nowrap; }
</style>
