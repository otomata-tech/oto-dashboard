<script setup lang="ts">
// Section « Context » — projection USER (ADR 0022 : 3 projections par audience).
// « Ce que MON Claude reçoit d'oto au handshake », en 3 couches par provenance, avec
// édition IN-SITU : le readme perso (AgentReadmeCard) + la visibilité des outils
// (toggles par namespace/outil). Le profil « situation avec oto » (oto_profile) reste
// à câbler (pas de route REST — capacité backend à ajouter). Projections org/plateforme
// (socle + view-as) = B3. Lit l'artefact RÉEL (getAgentContext = compose_session) —
// derive don't duplicate. Domicile canonique : absorbe à terme la carte agent-context
// read-only + les cartes readme dispersées (bascule B5).
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Icon from '@/components/console/Icon.vue'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import ContextProfileCard from '@/components/console/ContextProfileCard.vue'
import { getAgentContext, getAgentReadme, setAgentReadme, getTools, enableTool, disableTool } from '@/api/console'
import type { AgentContext, ToolEntry } from '@/types/api'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'

const { toast } = useToast()

const ctx = ref<AgentContext | null>(null)
const allTools = ref<ToolEntry[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const showInstructions = ref(false)
const expanded = ref<Set<string>>(new Set())
const busy = ref<Set<string>>(new Set())

const doctrine = computed(() => ctx.value?.doctrine ?? null)
const hasOrgReadme = computed(() => !!doctrine.value?.doctrine?.trim())
const namedDoctrines = computed(() => doctrine.value?.doctrines ?? [])

// Visibilité des outils = préférences USER (getTools), groupées par namespace. Truth
// « effective » (incl. activation d'org) : le total visible peut différer si un
// connecteur n'est pas activé pour l'org → note + lien /connectors.
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

// Bascule tout un namespace (hors protégés) : au moins un actif → tout masquer, sinon
// tout activer. Séquentiel (endpoint per-outil ; pas de route namespace côté user).
async function toggleNamespace(g: NsGroup) {
  const on = g.enabled === 0
  for (const t of g.tools) await setTool(t, on)
}

async function load() {
  try {
    const [c, tl] = await Promise.all([getAgentContext(), getTools()])
    ctx.value = c
    allTools.value = tl.tools
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
        exactement ce que ton Claude reçoit d'oto à la connexion, sous ton org active :
        les instructions de la plateforme, les readme cumulés (org → équipe → toi) et les
        outils réellement visibles. tu édites ici ce qui te revient ; le reste indique sa source.
      </p>
    </header>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else-if="!loaded" class="helptext">chargement…</p>

    <template v-else-if="ctx">
      <!-- Couche 1 — instructions plateforme (statique, héritée) -->
      <ConsoleCard title="instructions plateforme" flush
        sub="injectées au handshake : posture, bootstrap, boucle d'usage, catalogue de namespaces. communes à tous — tu ne les modifies pas.">
        <template #actions><Tag tone="cobalt">plateforme · hérité</Tag></template>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px">
          <Btn kind="mini" @click="showInstructions = !showInstructions">
            {{ showInstructions ? 'masquer' : 'voir le texte intégral' }}
          </Btn>
          <span class="dim" style="font-size: 12px">{{ ctx.instructions.length }} caractères</span>
        </div>
        <pre v-if="showInstructions" class="ctx-pre">{{ ctx.instructions }}</pre>
      </ConsoleCard>

      <!-- Couche 2a — readme hérités (org / équipe), lecture -->
      <ConsoleCard title="readme hérités" flush
        sub="la prose de ton org et de ton équipe, injectée avant la tienne. modifiable par un admin d'org, pas ici.">
        <template #actions>
          <Tag :tone="doctrine?.org ? 'olive' : undefined">{{ doctrine?.org || 'aucune org active' }}</Tag>
        </template>
        <div v-if="!doctrine?.org_id" class="helptext">
          aucune org active → ton agent démarre généraliste, sans readme d'org ni d'équipe.
        </div>
        <div v-else style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center">
          <Tag :tone="hasOrgReadme ? 'olive' : undefined">readme org · {{ hasOrgReadme ? 'défini' : 'vide' }}</Tag>
          <Tag v-if="doctrine?.group" tone="saffron">équipe : {{ doctrine.group }}</Tag>
          <Tag tone="cobalt">{{ namedDoctrines.length }} procédure(s)</Tag>
          <RouterLink to="/org"><Btn kind="mini">éditer le readme org →</Btn></RouterLink>
          <RouterLink to="/procedures"><Btn kind="mini">les procédures →</Btn></RouterLink>
        </div>
      </ConsoleCard>

      <!-- Couche 2b — TON readme (éditable in-situ) -->
      <AgentReadmeCard title="ton readme"
        sub="ta prose libre, injectée en dernier (après plateforme, org, équipe). c'est le seul readme que tu modifies ici."
        :can-edit="true" allow-empty
        placeholder="ex. je préfère des réponses courtes ; mes clients sont des PME ; signe mes emails « Alexis »."
        :load="getAgentReadme" :save="setAgentReadme" />

      <!-- Couche 2c — fiche profil « situation avec oto » (éditable in-situ) -->
      <ContextProfileCard />

      <!-- Couche 3 — outils visibles (éditable : toggles par namespace / outil) -->
      <ConsoleCard title="outils visibles" flush
        sub="ce que ton agent voit sous ton org active. déplie un namespace pour affiner outil par outil. les outils protégés restent toujours visibles.">
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
                {{ g.enabled > 0 ? 'tout masquer' : 'tout activer' }}
              </Btn>
            </div>
            <div v-if="expanded.has(g.namespace)" class="tool-list">
              <div v-for="t in g.tools" :key="t.name" class="tool-row">
                <code class="tool-name">{{ t.name }}</code>
                <span class="tool-desc">{{ t.description || '—' }}</span>
                <Tag v-if="t.protected" tone="cobalt">protégé</Tag>
                <Btn v-else kind="mini" :disabled="busy.has(t.name)" @click="setTool(t, !t.enabled)">
                  {{ t.enabled ? 'masquer' : 'afficher' }}
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
    </template>
  </div>
</template>

<style scoped>
.ctx-intro { margin-bottom: 18px; }
.ctx-h1 { font-weight: 700; font-size: 20px; color: var(--color-ink); letter-spacing: -0.01em; }
.ctx-lead { font-size: 13.5px; color: var(--color-mute); line-height: 1.6; margin-top: 6px; max-width: 720px; }
.ctx-pre {
  white-space: pre-wrap; word-break: break-word;
  font-size: 12px; line-height: 1.5; max-height: 420px; overflow: auto;
  background: var(--color-paper-3, #f5f1e8);
  border: 1px solid var(--color-hair-soft, #e3dccd);
  border-radius: 8px; padding: 12px 14px; color: var(--color-ink-soft, #4a463d);
}

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
.tool-desc { font-size: 12px; color: var(--color-mute); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
