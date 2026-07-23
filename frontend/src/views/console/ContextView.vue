<script setup lang="ts">
// Section « Context » — projection USER (ADR 0022 : 3 projections par audience).
// « Ce que MON Claude reçoit d'oto au handshake ». Refonte « anatomie en couches »
// (2026-07-23) : le hero = la pile des couches RÉELLES de l'artefact injecté
// (backend `session_layers`, chaque couche avec son poids en caractères, expansion
// = contenu + édition in-situ pour la note user). Lit l'artefact RÉEL
// (getAgentContext = compose_session) — derive don't duplicate. Sections
// secondaires : guides on-demand (oto_guide) + visibilité des outils + org maison.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Icon from '@/components/console/Icon.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import GuidesCard from '@/components/console/GuidesCard.vue'
import ContextLayerStack from '@/components/console/ContextLayerStack.vue'
import { getAgentContext, getAgentReadme, setAgentReadme, getTools, enableTool, disableTool, getMyOrgs, setActiveOrg, clearActiveOrg } from '@/api/console'
import type { AgentContext, ToolEntry, Org } from '@/types/api'
import { useToast } from '@/composables/useToast'
import { useMe } from '@/composables/useMe'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { me, reload: reloadMe } = useMe()

const ctx = ref<AgentContext | null>(null)
const allTools = ref<ToolEntry[]>([])
const orgs = ref<Org[]>([])
const savingHome = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
const expanded = ref<Set<string>>(new Set())
const busy = ref<Set<string>>(new Set())

const hasGroup = computed(() => !!ctx.value?.doctrine?.group)

// Visibilité des outils = préférences USER (getTools), groupées par namespace.
interface NsGroup { namespace: string; tools: ToolEntry[]; enabled: number; total: number }
const nsGroups = computed<NsGroup[]>(() => {
  const by: Record<string, ToolEntry[]> = {}
  for (const t of allTools.value) {
    const ns = t.name.split('_', 1)[0] ?? t.name
    ;(by[ns] ??= []).push(t)
  }
  return Object.entries(by)
    .map(([namespace, tools]) => ({
      namespace,
      tools: [...tools].sort((a, b) => a.name.localeCompare(b.name)),
      enabled: tools.filter((t) => t.enabled).length,
      total: tools.length,
    }))
    .sort((a, b) => Number(b.enabled > 0) - Number(a.enabled > 0) || a.namespace.localeCompare(b.namespace))
})
const totalVisible = computed(() => allTools.value.filter((t) => t.enabled).length)
const totalHidden = computed(() => allTools.value.length - totalVisible.value)

function toggleExpand(ns: string) {
  const s = new Set(expanded.value)
  s.has(ns) ? s.delete(ns) : s.add(ns)
  expanded.value = s
}

async function setTool(t: ToolEntry, on: boolean) {
  if (t.protected || busy.value.has(t.name) || t.enabled === on) return
  const b = new Set(busy.value); b.add(t.name); busy.value = b
  try {
    if (on) await enableTool(t.name); else await disableTool(t.name)
    t.enabled = on
  } catch (e) { toast(humanize(e)) }
  finally { const b2 = new Set(busy.value); b2.delete(t.name); busy.value = b2 }
}

// Bascule tout un namespace (hors protégés) : au moins un actif → tout masquer,
// sinon tout activer. Séquentiel (endpoint per-outil).
async function toggleNamespace(g: NsGroup) {
  const on = g.enabled === 0
  for (const t of g.tools) await setTool(t, on)
}

// Poser l'org MAISON = le SEUL geste de cette page qui touche le MCP (défaut des
// nouvelles conversations Claude, ADR 0023). « aucune » → identité perso/globale.
async function onHomeChange(val: string) {
  const target = val === '' ? null : Number(val)
  if (target === (me.value?.home_org ?? null)) return
  savingHome.value = true
  try {
    if (target === null) await clearActiveOrg()
    else await setActiveOrg(target)
    await reloadMe()
    ctx.value = await getAgentContext()   // la pile dépend de l'org maison
  } catch (err) { toast(humanize(err)) }
  finally { savingHome.value = false }
}

async function load() {
  try {
    const [c, tl, o] = await Promise.all([getAgentContext(), getTools(), getMyOrgs()])
    ctx.value = c
    allTools.value = tl.tools
    orgs.value = o.orgs
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)
</script>

<template>
  <div class="content-inner fadein">
    <header class="ctx-intro">
      <h2 class="ctx-h1">ce que voit ton agent</h2>
      <p class="ctx-lead">
        l'anatomie exacte de ce que ton Claude reçoit d'oto au démarrage de chaque conversation —
        couche par couche, avec le poids de chacune. clique une couche pour lire son contenu et l'éditer.
      </p>
    </header>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else-if="!loaded" class="helptext">chargement…</p>

    <template v-else-if="ctx">
      <!-- ══ HERO : la pile des couches injectées ══ -->
      <ContextLayerStack :layers="ctx.layers ?? []" :has-group="hasGroup">
        <template #user-editor>
          <AgentReadmeCard title="ta note"
            sub="ta prose libre — préférences, contexte, ton. injectée à chaque session, après les couches d'org et d'équipe."
            :can-edit="true" allow-empty
            placeholder="ex. je préfère des réponses courtes ; mes clients sont des PME ; signe mes emails « Alexis »."
            :load="getAgentReadme" :save="setAgentReadme" />
        </template>
      </ContextLayerStack>

      <!-- ══ CE QU'IL VA CHERCHER AU BESOIN ══ -->
      <div class="sec">
        <h3 class="sec-t">ce qu'il va chercher au besoin</h3>
        <p class="sec-s">
          des how-to qu'il <strong>ne garde pas en tête</strong> mais qu'il ouvre quand la tâche le demande
          (via <code>oto_guide</code>) — zéro poids sur les conversations qui n'en ont pas besoin.
        </p>
      </div>
      <GuidesCard scope="user" :can-edit="true" title="tes guides" sub="" />

      <!-- ══ CE QU'IL PEUT FAIRE ══ -->
      <div class="sec">
        <h3 class="sec-t">ce qu'il peut faire</h3>
        <p class="sec-s">les outils visibles pour ton agent. déplie un namespace pour affiner outil par outil.</p>
      </div>
      <ConsoleCard flush>
        <template #actions>
          <Tag tone="olive">{{ totalVisible }} visibles · {{ totalHidden }} masqués</Tag>
        </template>
        <div class="ns-list">
          <div v-for="g in nsGroups" :key="g.namespace" class="ns-block">
            <div class="ns-head" @click="toggleExpand(g.namespace)">
              <Icon name="chevd" :size="13" class="ns-chev" :class="{ open: expanded.has(g.namespace) }" />
              <strong class="ns-name">{{ g.namespace }}_*</strong>
              <Tag :tone="g.enabled > 0 ? 'olive' : undefined">{{ g.enabled }} / {{ g.total }}</Tag>
              <span style="flex: 1"></span>
              <Btn kind="mini" @click.stop="toggleNamespace(g)">
                {{ g.enabled > 0 ? 'Tout masquer' : 'Tout activer' }}
              </Btn>
            </div>
            <div v-if="expanded.has(g.namespace)" class="tool-list">
              <div v-for="t in g.tools" :key="t.name" class="tool-row">
                <code class="tool-name">{{ t.name }}</code>
                <span class="tool-desc">{{ t.description || '—' }}</span>
                <Tag v-if="t.protected" tone="cobalt">protégé</Tag>
                <Btn v-else kind="mini" :disabled="busy.has(t.name)" @click="setTool(t, !t.enabled)">
                  {{ t.enabled ? 'Masquer' : 'Afficher' }}
                </Btn>
              </div>
            </div>
          </div>
        </div>
        <p class="helptext" style="margin-top: 12px">
          un outil peut rester masqué si son connecteur n'est pas activé pour l'org —
          <RouterLink to="/connectors" class="linklike">gérer les connexions</RouterLink>.
        </p>
      </ConsoleCard>

      <!-- ══ RÉGLAGE : org par défaut — n'a de sens qu'avec un CHOIX (≥2 orgs) ══ -->
      <ConsoleCard v-if="orgs.length > 1" title="org par défaut"
        sub="l'org sous laquelle ton agent agit par défaut dans une nouvelle conversation — recompose toutes les couches ci-dessus.">
        <template #actions>
          <Tag :tone="me?.home_org ? 'olive' : undefined">{{ me?.home_org_name || 'aucune · généraliste' }}</Tag>
        </template>
        <div class="home-row">
          <OtoSelect :model-value="String(me?.home_org ?? '')" @update:model-value="onHomeChange"
            :options="orgs.map((o) => ({ value: String(o.id), label: o.name }))"
            none-label="aucune (agent généraliste)" :disabled="savingHome" trigger-class="min-w-[14rem]" />
          <span v-if="savingHome" class="dim" style="font-size: 12px">enregistrement…</span>
        </div>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.ctx-intro { margin-bottom: 18px; }
.ctx-h1 { font-weight: 700; font-size: 20px; color: var(--color-ink); letter-spacing: -0.01em; }
.ctx-lead { font-size: 13.5px; color: var(--color-mute); line-height: 1.6; margin-top: 6px; max-width: 720px; }

/* En-têtes de section (au besoin / outils / réglage). content-inner porte gap:16px. */
.sec { margin: 12px 0 0; }
.sec-t { font-weight: 700; font-size: 14.5px; color: var(--color-ink); letter-spacing: -0.01em; }
.sec-s { font-size: 12.5px; color: var(--color-mute); line-height: 1.55; margin-top: 3px; max-width: 640px; }
.sec-s code { font-family: var(--font-mono); font-size: 11.5px; color: var(--color-saffron-ink); }

.home-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }

.ns-list { display: flex; flex-direction: column; }
.ns-block { border-top: 1px solid var(--color-hair-soft); }
.ns-block:first-child { border-top: 0; }
.ns-head {
  display: flex; align-items: center; gap: 9px; padding: 9px 2px; cursor: pointer;
}
.ns-head:hover { background: var(--color-paper-2); }
.ns-chev { color: var(--color-faint); transition: transform 0.15s; }
.ns-chev.open { transform: rotate(180deg); }
.ns-name { font-size: 13.5px; color: var(--color-ink); }

.tool-list { padding: 2px 2px 8px 22px; }
.tool-row {
  display: flex; align-items: center; gap: 10px; padding: 5px 0;
  border-top: 1px solid var(--color-hair-soft);
}
.tool-row:first-child { border-top: 0; }
.tool-name { font-size: 12.5px; font-weight: 600; color: var(--color-saffron-ink); flex: none; min-width: 12rem; }
.tool-desc { font-size: 12px; color: var(--color-mute); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
