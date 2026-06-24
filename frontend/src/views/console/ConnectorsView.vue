<script setup lang="ts">
// Connecteurs — surface UNIFIÉE (fusion ex-/connectors + ex-/toolbox + ex-/my-connectors).
// Un connecteur = UNE chose à deux faces : config de la connexion (credential) ET
// paramétrage de ses outils (toolbox). Chaque connecteur est une carte (ConnectorCard)
// portant les deux + le sélecteur 3 états (actif/masqué/désactivé, ADR 0019). Tous les
// flux de connexion (clé, oauth, session, hosted, mcp fédéré) sont rendus INLINE sur la
// carte du connecteur (ADR 0024 R1) — plus de cartes ancrées. Presets de toolbox tout en
// bas. Les tokens CLI ont migré vers le hub compte (/account, user-scopés).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import ConnectorCard from '@/components/console/ConnectorCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import {
  getMyConnectors, getTools, getPresets, setCredential, deleteApiKey,
  applyPreset as applyPresetApi, savePreset, deletePreset,
} from '@/api/console'
import type {
  ConnectorState, MyConnector, PresetEntry, ToolEntry,
} from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { promptForm, promptText, confirmAction } = usePrompt()
const { me, reload } = useMe()

const profileLabel = computed(() => me.value?.active_org_name || 'Perso')

const catalog = ref<MyConnector[]>([])
const tools = ref<ToolEntry[]>([])
const presets = ref<PresetEntry[]>([])
const error = ref<string | null>(null)
const q = ref('')

const nsOf = (toolName: string): string => toolName.split('_')[0] ?? toolName
function toolsOf(c: MyConnector): ToolEntry[] {
  const ns = new Set(c.namespaces)
  return tools.value.filter((t) => ns.has(nsOf(t.name)))
}

// Tri : actifs d'abord, puis masqués, puis désactivés ; à l'intérieur par libellé.
const ORDER: Record<ConnectorState, number> = { active: 0, paused: 1, not_selected: 2 }
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return catalog.value
    .filter((c) => !needle
      || c.label.toLowerCase().includes(needle)
      || c.name.toLowerCase().includes(needle)
      || c.publisher.toLowerCase().includes(needle)
      || c.namespaces.some((n) => n.includes(needle)))
    .sort((a, b) => (ORDER[a.state] - ORDER[b.state]) || a.label.localeCompare(b.label))
})
const activeCount = computed(() => catalog.value.filter((c) => c.state === 'active').length)
const exposedTools = computed(() => tools.value.filter((t) => t.enabled).length)

async function load() {
  try {
    const [mc, tl, pr] = await Promise.all([
      getMyConnectors(), getTools(), getPresets().catch(() => ({ presets: [] })),
    ])
    catalog.value = mc.connectors
    tools.value = tl.tools
    presets.value = pr.presets
  } catch (e) { error.value = humanize(e) }
}
onMounted(async () => {
  await load()
  // Retour d'un flux de connexion (oauth google/fédéré, hosted unipile) :
  // ?<x>=connected|error|subscribed. Les widgets inline rechargent leur propre statut
  // au mount ; ici juste la confirmation + nettoyage de l'URL.
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

// ── credential keyé (générique, ADR 0011) ──
async function configure(c: MyConnector) {
  const fields = c.credential_fields ?? []
  if (!fields.length) return
  const single = fields.length === 1
  const r = await promptForm({
    title: single ? `${c.label} api key` : `connect ${c.label}`,
    description: single
      ? `your ${c.label} key — stored encrypted; yours overrides the org and platform keys.`
      : `your ${c.label} credentials — stored encrypted, used to act on your behalf.`,
    fields: fields.map((f) => ({
      key: f.name, label: f.label.toLowerCase(), type: f.secret ? 'password' : undefined,
      required: true, placeholder: single ? `paste your ${c.label} key` : undefined,
    })),
    submitLabel: single ? 'save' : 'connect',
  })
  if (!r) return
  try { await setCredential(c.name, r); toast(`${c.label} ${single ? 'key saved' : 'connected'}`); await reload() }
  catch (e) { toast(humanize(e)) }
}
async function removeKey(c: MyConnector) {
  if (!await confirmAction({ title: 'remove key', danger: true, confirmLabel: 'remove', message: `remove your ${c.label} key?` })) return
  try { await deleteApiKey(c.name); toast('key removed'); await reload() }
  catch (e) { toast(humanize(e)) }
}

// Les flux de connexion non-keyés (session crunchbase, mcp fédéré, hosted unipile)
// sont désormais rendus INLINE par des widgets auto-suffisants dans la ConnectorCard
// (ADR 0024 R1) — plus de cartes ancrées ni de handlers ici.

// ── presets de toolbox ──
async function applyPreset(name: string) {
  try { await applyPresetApi(name); tools.value = (await getTools()).tools; toast(`preset "${name}" applied`) } catch (e) { toast(humanize(e)) }
}
async function saveCurrentPreset() {
  const name = await promptText('save preset', { label: 'preset name', required: true, placeholder: 'e.g. prospection', hint: 'snapshots your current tool selection' })
  if (!name) return
  try { await savePreset(name); presets.value = (await getPresets()).presets; toast(`preset "${name}" saved`) } catch (e) { toast(humanize(e)) }
}
async function removePreset(name: string) {
  if (!await confirmAction({ title: 'delete preset', danger: true, confirmLabel: 'delete', message: `delete preset "${name}"?` })) return
  try { await deletePreset(name); presets.value = (await getPresets()).presets; toast('preset deleted') } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <p class="helptext" style="margin: -4px 0 2px">
      connectors · <strong style="color: var(--color-ink)">{{ profileLabel }}</strong>
      <span v-if="me && me.active_org == null"> — profil perso/global</span>
      <span v-else> — propre à cette organisation</span>
    </p>

    <div class="grid3">
      <Stat label="connectors active" :value="activeCount" :unit="'/ ' + catalog.length" sub="exposing tools to your agents" />
      <Stat label="tools exposed" :value="exposedTools" :unit="'/ ' + tools.length" sub="what your mcp clients see" />
      <Stat label="presets" :value="presets.length" sub="one-click tool selections" />
    </div>

    <ConsoleCard title="connectors"
      sub="one card per connector — its connection (credential) and its tools, together. active = tools exposed · hidden = installed but tools cloaked · off = disabled (default).">
      <template #actions>
        <input v-model="q" class="cc-search" placeholder="search connectors…" />
      </template>
      <div class="cc-grid">
        <ConnectorCard v-for="c in shown" :key="c.name" :connector="c" :tools="toolsOf(c)"
          @configure="configure" @remove="removeKey" />
      </div>
      <p v-if="!shown.length" class="helptext" style="text-align: center; padding: 16px">no connector matches “{{ q }}”.</p>
    </ConsoleCard>


    <ConsoleCard title="presets" sub="saved tool selections — switch your whole toolbox in one move.">
      <template #actions><Btn kind="mini" icon="plus" @click="saveCurrentPreset">save current</Btn></template>
      <div class="rowlist">
        <div v-for="p in presets" :key="p.name" class="rowitem" style="gap: 12px">
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 600; font-size: 13px">{{ p.name }}
              <span style="font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); margin-left: 4px">{{ p.tool_count }} tools</span>
            </div>
            <div style="font-size: 11.5px; color: var(--color-mute)">updated {{ fmtDate(p.updated_at) ?? '—' }}</div>
          </div>
          <Btn kind="mini" @click="applyPreset(p.name)">apply</Btn>
          <Btn kind="danger" @click="removePreset(p.name)">delete</Btn>
        </div>
        <div v-if="!presets.length" class="helptext">no presets yet — tune your tools then “save current”.</div>
      </div>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.cc-grid { display: flex; flex-direction: column; gap: 12px; }
.cc-search {
  font-size: 12px; padding: 5px 10px; border: 1px solid var(--color-hair-classic);
  border-radius: 8px; background: var(--color-surface); color: var(--color-ink); width: 200px;
}
.cc-search:focus { outline: none; border-color: var(--color-ink); }
</style>
