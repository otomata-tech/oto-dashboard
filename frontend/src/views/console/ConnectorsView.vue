<script setup lang="ts">
// Connecteurs — surface UNIFIÉE (projection USER, ADR 0022). Liste sur le socle partagé
// ConnectorList + ConnectorIdentityCell (une LIGNE par connecteur : connexion · outils ·
// exposition) ; lentilles (all/connected/available/shared) en slot #controls. Le détail —
// connexion (widgets d'auth), outils (toggles), à propos — vit dans un DRAWER latéral
// (ConnectorDrawer, monté ici). Un connecteur = UNE chose à deux faces : credential +
// toolbox. getMyConnectors() renvoie le catalogue COMPLET avec l'état par membre → les
// lentilles opèrent sur cette liste unique. Tokens CLI migrés vers le hub compte (/account).
import { computed, onMounted, ref } from 'vue'
import ConnectorList from '@/components/console/ConnectorList.vue'
import ConnectorIdentityCell from '@/components/console/ConnectorIdentityCell.vue'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import ConnectorDrawer from '@/components/console/ConnectorDrawer.vue'
import CredentialFieldsDialog from '@/components/console/CredentialFieldsDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import { getMyConnectors, getTools, getToolRegistry, setCredential, deleteApiKey, verifyConnector } from '@/api/console'
import type { ConnectorState, MyConnector, ToolEntry } from '@/types/api'
import type { DotTone } from '@/lib/consoleTypes'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me, reload } = useMe()

const catalog = ref<MyConnector[]>([])
// Les outils portent leur description (registre résolu, ADR 0014) FUSIONNÉE dès le
// load → `toolsOf` renvoie des RÉFÉRENCES à ces objets (pas des copies) : un toggle
// depuis le drawer mute la source et se reflète dans la table (et inversement).
const tools = ref<(ToolEntry & { description?: string })[]>([])
const error = ref<string | null>(null)

type Lens = 'all' | 'connected' | 'available' | 'shared'
const lens = ref<Lens>('all')
const selectedName = ref<string | null>(null)

// credential keyé (générique, ADR 0011) — dialog possédé ici, ouvert depuis le drawer.
const credOpen = ref(false)
const credConnector = ref<MyConnector | null>(null)

const nsOf = (toolName: string): string => toolName.split('_')[0] ?? toolName
function toolsOf(c: MyConnector): (ToolEntry & { description?: string })[] {
  const ns = new Set(c.namespaces)
  // Références (pas de copie) : toggles persistants + cohérence table↔drawer.
  return tools.value.filter((t) => ns.has(nsOf(t.name)))
}
function modeOf(c: MyConnector): string | undefined { return me.value?.providers?.[c.name]?.mode }

function matchesLens(c: MyConnector, l: Lens): boolean {
  if (l === 'connected') return c.state !== 'not_selected'
  if (l === 'available') return c.state === 'not_selected'
  if (l === 'shared') { const m = modeOf(c); return m === 'org' || m === 'group' }
  return true
}
const counts = computed(() => ({
  all: catalog.value.length,
  connected: catalog.value.filter((c) => matchesLens(c, 'connected')).length,
  available: catalog.value.filter((c) => matchesLens(c, 'available')).length,
  shared: catalog.value.filter((c) => matchesLens(c, 'shared')).length,
}))

// La lentille filtre en amont (reste dans la vue) ; ConnectorList fait recherche/chips/tri.
const lensItems = computed(() => catalog.value.filter((c) => matchesLens(c, lens.value)))

const ORDER: Record<ConnectorState, number> = { active: 0, paused: 1, not_selected: 2 }
// Haystack multi-champs (label/name/publisher/category/namespaces/outils).
function searchText(c: MyConnector): string {
  return [c.label, c.name, c.publisher, c.category, ...c.namespaces, ...toolsOf(c).map((t) => t.name)].join(' ')
}

const LENS_META: Record<Lens, { title: string; sub: string }> = {
  all: { title: 'all connectors', sub: 'everything oto can drive — connect what you need, expose only the tools you trust.' },
  connected: { title: 'connected', sub: 'connectors installed in your workspace — live or muted.' },
  available: { title: 'available to add', sub: 'in the catalog but not yet in your workspace. click one to connect it.' },
  shared: { title: 'shared with you', sub: 'usable without pasting your own key — your org or team provides one.' },
}

// Cellule connexion (dot + libellé + sous-libellé) dérivée de l'auth + du mode résolu.
function connection(c: MyConnector): { label: string; tone: DotTone; sub: string } {
  if (c.auth.method === 'none') return { label: 'Open data', tone: 'cobalt', sub: 'no credential needed' }
  const m = modeOf(c)
  if (!m || m === 'forbidden') return { label: 'Not connected', tone: 'faint', sub: 'needs a key' }
  const sub = m === 'user' ? 'your key' : m === 'org' ? 'org key' : m === 'group' ? 'team key' : (c.free_tier ? 'oto platform · free' : 'oto platform key')
  return { label: 'Connected', tone: 'olive', sub }
}
const EXPOSURE: Record<ConnectorState, { label: string; tone: DotTone }> = {
  active: { label: 'live', tone: 'olive' },
  paused: { label: 'muted', tone: 'saffron' },
  not_selected: { label: 'off', tone: 'faint' },
}
function toolStats(c: MyConnector): { enabled: number; total: number; pct: number } {
  const ts = toolsOf(c)
  const enabled = ts.filter((t) => t.enabled).length
  return { enabled, total: ts.length, pct: ts.length ? Math.round((enabled / ts.length) * 100) : 0 }
}

const selected = computed(() => catalog.value.find((c) => c.name === selectedName.value) ?? null)

async function load() {
  try {
    const [mc, tl, reg] = await Promise.all([
      getMyConnectors(), getTools(),
      getToolRegistry().catch(() => ({ tools: [], count: 0 })),
    ])
    catalog.value = mc.connectors
    const desc = new Map(reg.tools.map((t) => [t.name, t.description]))
    tools.value = tl.tools.map((t) => ({ ...t, description: desc.get(t.name) }))
  } catch (e) { error.value = humanize(e) }
}
onMounted(async () => {
  await load()
  // Retour d'un flux de connexion (oauth google/fédéré, hosted unipile) : ?<x>=connected|error.
  const sp = new URLSearchParams(window.location.search)
  let touched = false
  for (const [k, v] of sp.entries()) {
    if (k === 'channel') continue
    if (v === 'connected' || v === 'subscribed') { toast(`${k} connecté`); touched = true }
    else if (v === 'error' || v === 'failed') { toast(`échec de la connexion ${k}`); touched = true }
    else if (v === 'cancel') touched = true
  }
  if (touched) window.history.replaceState({}, '', window.location.pathname)
})

// ── credential keyé (dialog) ──
function configure(c: MyConnector) {
  if (!(c.credential_fields ?? []).length) return
  credConnector.value = c
  credOpen.value = true
}
async function doSetCredential(values: Record<string, string>) {
  const c = credConnector.value
  if (!c) return
  const single = (c.credential_fields ?? []).length === 1
  try { await setCredential(c.name, values); toast(`${c.label} ${single ? 'key saved' : 'connected'}`); await reload() }
  catch (e) { toast(humanize(e)); throw e }
}
// Sonde câblée au dialog quand le connecteur est vérifiable (teste juste après la pose).
const doVerifyCred = () => verifyConnector(credConnector.value!.name)
async function removeKey(c: MyConnector) {
  if (!await confirmAction({ title: 'remove key', danger: true, confirmLabel: 'Remove', message: `remove your ${c.label} key?` })) return
  try { await deleteApiKey(c.name); toast('key removed'); await reload() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConnectorList :items="lensItems" :item-key="(c) => c.name" :label="(c) => c.label"
      :search-text="searchText" :category="(c) => c.category" :sort-rank="(c) => ORDER[c.state]"
      :category-values="catalog.map((c) => c.category)" v-model:selected-key="selectedName"
      :title="LENS_META[lens].title" :sub="LENS_META[lens].sub"
      search-placeholder="search connectors, tools, publishers…">
      <template #actions><Btn kind="mini" icon="plus" @click="lens = 'available'">Add connector</Btn></template>
      <template #controls>
        <div class="seg" role="tablist">
          <button :class="{ on: lens === 'all' }" @click="lens = 'all'">all <span class="dim">{{ counts.all }}</span></button>
          <button :class="{ on: lens === 'connected' }" @click="lens = 'connected'">connected <span class="dim">{{ counts.connected }}</span></button>
          <button :class="{ on: lens === 'available' }" @click="lens = 'available'">available <span class="dim">{{ counts.available }}</span></button>
          <button :class="{ on: lens === 'shared' }" @click="lens = 'shared'">shared <span class="dim">{{ counts.shared }}</span></button>
        </div>
      </template>
      <template #head>
        <th style="width: 34%">connector</th>
        <th>connection</th>
        <th>tools</th>
        <th>exposure</th>
        <th style="width: 24px"></th>
      </template>
      <template #row="{ item: c }">
        <td><ConnectorIdentityCell :meta="c" :recommended="c.recommended" /></td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px">
            <Dot :tone="connection(c).tone" />
            <div>
              <div style="font-size: 12px; color: var(--color-ink-soft); font-weight: 500">{{ connection(c).label }}</div>
              <div style="font-size: 10.5px; color: var(--color-faint)">{{ connection(c).sub }}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 9px">
            <span class="tbar"><i :style="{ width: toolStats(c).pct + '%' }"></i></span>
            <span class="mono" style="font-size: 11px; color: var(--color-mute)">{{ toolStats(c).enabled }}/{{ toolStats(c).total }}</span>
          </div>
        </td>
        <td>
          <span class="cv-exp"><Dot :tone="EXPOSURE[c.state].tone" />{{ EXPOSURE[c.state].label }}</span>
        </td>
        <td style="text-align: right; color: var(--color-faint); font-weight: 700">›</td>
      </template>
    </ConnectorList>

    <ConnectorDrawer v-if="selected" :connector="selected" :tools="toolsOf(selected)"
      @close="selectedName = null" @configure="configure" @remove="removeKey" />

    <CredentialFieldsDialog v-if="credConnector" v-model:open="credOpen"
      :label="credConnector.label"
      :fields="credConnector.credential_fields ?? []"
      :single="(credConnector.credential_fields ?? []).length === 1"
      :on-confirm="doSetCredential"
      :verify="credConnector.verifiable ? doVerifyCred : undefined" />
  </div>
</template>

<style scoped>
.dim { opacity: .6; }
.tbar { height: 5px; width: 62px; border-radius: 999px; background: var(--color-hair-soft); overflow: hidden; display: inline-block; }
.tbar > i { display: block; height: 100%; border-radius: 999px; background: var(--color-olive); }
.cv-exp { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--color-mute); }
</style>
