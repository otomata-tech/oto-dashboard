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
import Icon from '@/components/console/Icon.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import GuidesCard from '@/components/console/GuidesCard.vue'
import ContextLayerStack from '@/components/console/ContextLayerStack.vue'
import ContextProfileCard from '@/components/console/ContextProfileCard.vue'
import { getAgentContext, getAgentToolbox, getInitGuide, setInitGuide, getTools, getMyOrgs, setActiveOrg, clearActiveOrg } from '@/api/console'
import type { AgentContext, AgentToolbox, ToolEntry, Org } from '@/types/api'
import { toolsSeenView } from '@/lib/agentToolbox'
import { useToast } from '@/composables/useToast'
import { useMe } from '@/composables/useMe'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { toast } = useToast()
const { me, reload: reloadMe } = useMe()

const ctx = ref<AgentContext | null>(null)
const allTools = ref<ToolEntry[]>([])
const orgs = ref<Org[]>([])
const savingHome = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
const expanded = ref<Set<string>>(new Set())

// Ma note = un guide `delivery=init` au scope user (ADR 0042).
const loadMyNote = () => getInitGuide('user')
const saveMyNote = (body: string) => setInitGuide('user', body)

// « Ce qu'il peut faire » = ce que l'agent VOIT (oto#166), lu sur la vue calculée par la
// poignée de main. L'ancienne liste groupait `getTools` — tout le catalogue et les
// préférences — et comptait « visible » tout outil non masqué, connecteur installé ou
// non : elle promettait des outils que l'agent n'avait pas. Masquer un outil a quitté le
// dashboard (oto#192) : la liste se lit ici, elle ne s'y règle plus.
const toolbox = ref<AgentToolbox | null>(null)
const toolboxError = ref<string | null>(null)
const view = computed(() => toolsSeenView(toolbox.value, allTools.value))

function loadToolbox(): Promise<AgentToolbox | null> {
  return getAgentToolbox()
    .then((tb) => { toolboxError.value = null; return tb })
    .catch((e) => { toolboxError.value = humanize(e); return null })
}
function toggleExpand(ns: string) {
  const s = new Set(expanded.value)
  s.has(ns) ? s.delete(ns) : s.add(ns)
  expanded.value = s
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
    toolbox.value = await loadToolbox()   // ce qu'il voit aussi
  } catch (err) { toast(humanize(err)) }
  finally { savingHome.value = false }
}

async function load() {
  try {
    const [c, tl, o, tb] = await Promise.all([getAgentContext(), getTools(), getMyOrgs(), loadToolbox()])
    ctx.value = c
    allTools.value = tl.tools
    orgs.value = o.orgs
    toolbox.value = tb
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)
</script>

<template>
  <div class="content-inner fadein">
    <header class="ctx-intro">
      <h2 class="ctx-h1">{{ t('contextUi.preview.title') }}</h2>
      <p class="ctx-lead">{{ t('contextUi.view.lead') }}</p>
    </header>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else-if="!loaded" class="helptext">{{ t('common.loading') }}</p>

    <template v-else-if="ctx">
      <!-- ══ HERO : la pile des couches injectées ══ -->
      <ContextLayerStack :layers="ctx.layers ?? []">
        <template #profile-editor>
          <ContextProfileCard :title="t('contextUi.layers.ghost.profile')" :sub="t('contextUi.view.profileSub')" />
        </template>
        <template #user-editor>
          <AgentReadmeCard :title="t('contextUi.layers.ghost.user')" :sub="t('contextUi.view.noteSub')"
            :can-edit="true" allow-empty
            :placeholder="t('contextUi.view.notePlaceholder')"
            :load="loadMyNote" :save="saveMyNote" />
        </template>
      </ContextLayerStack>

      <!-- ══ CE QU'IL VA CHERCHER AU BESOIN ══ -->
      <div class="sec">
        <h3 class="sec-t">{{ t('contextUi.view.onDemandTitle') }}</h3>
        <i18n-t keypath="contextUi.view.onDemand" tag="p" class="sec-s">
          <template #notKept><strong>{{ t('contextUi.view.notKept') }}</strong></template>
          <template #tool><code>oto_guide</code></template>
        </i18n-t>
      </div>
      <GuidesCard scope="user" :can-edit="true" :title="t('contextUi.view.yourGuides')" sub="" />

      <!-- ══ CE QU'IL PEUT FAIRE ══ -->
      <div class="sec">
        <h3 class="sec-t">{{ t('contextUi.view.canDoTitle') }}</h3>
        <p class="sec-s">{{ t('contextUi.view.canDo') }}</p>
      </div>
      <ConsoleCard flush>
        <template v-if="view" #actions>
          <Tag tone="olive">{{ t('contextUi.view.visibleMasked', { visible: view.visible, masked: view.maskedByYou }) }}</Tag>
        </template>
        <!-- Vue non dérivable ≠ « aucun outil » : on le dit, sans compteur. -->
        <p v-if="toolboxError" class="helptext" style="color: var(--color-terra-ink)">{{ toolboxError }}</p>
        <p v-else-if="!view" class="helptext">{{ t('contextUi.view.toolsUnavailable') }}</p>
        <div v-else class="ns-list">
          <div v-for="g in view.groups" :key="g.namespace" class="ns-block">
            <div class="ns-head" @click="toggleExpand(g.namespace)">
              <Icon name="chevd" :size="13" class="ns-chev" :class="{ open: expanded.has(g.namespace) }" />
              <strong class="ns-name">{{ g.namespace }}_*</strong>
              <Tag :tone="g.visible > 0 ? 'olive' : undefined">{{ g.visible }} / {{ g.tools.length }}</Tag>
            </div>
            <div v-if="expanded.has(g.namespace)" class="tool-list">
              <div v-for="outil in g.tools" :key="outil.name" class="tool-row">
                <code class="tool-name">{{ outil.name }}</code>
                <span class="tool-desc">{{ outil.description || '—' }}</span>
                <Tag v-if="outil.protected" tone="cobalt">{{ t('contextUi.view.protected') }}</Tag>
                <Tag v-else-if="!outil.visible">{{ t('contextUi.view.maskedByYou') }}</Tag>
              </div>
            </div>
          </div>
        </div>
        <p class="helptext" style="margin-top: 12px">
          <i18n-t keypath="contextUi.view.maskedHint" tag="span">
            <template #link><RouterLink to="/connectors" class="linklike">{{ t('contextUi.view.manageConnections') }}</RouterLink></template>
          </i18n-t>
        </p>
      </ConsoleCard>

      <!-- ══ RÉGLAGE : org par défaut — n'a de sens qu'avec un CHOIX (≥2 orgs) ══ -->
      <ConsoleCard v-if="orgs.length > 1" :title="t('contextUi.view.homeTitle')" :sub="t('contextUi.view.homeSub')">
        <template #actions>
          <Tag :tone="me?.home_org ? 'olive' : undefined">{{ me?.home_org_name || t('contextUi.view.homeNone') }}</Tag>
        </template>
        <div class="home-row">
          <OtoSelect :model-value="String(me?.home_org ?? '')" @update:model-value="onHomeChange"
            :options="orgs.map((o) => ({ value: String(o.id), label: o.name }))"
            :none-label="t('contextUi.view.homeNoneOption')" :disabled="savingHome" trigger-class="min-w-[14rem]" />
          <span v-if="savingHome" class="dim" style="font-size: 12px">{{ t('contextUi.view.saving') }}</span>
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
