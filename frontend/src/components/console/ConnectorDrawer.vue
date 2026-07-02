<script setup lang="ts">
// Drawer latéral de détail d'UN connecteur (design Connectors.dc.html) — ouvert
// depuis une ligne de la table. Coiffé d'un contrôle d'exposition (off/muted/live,
// câblé sur connector_selection, ADR 0019) et 3 onglets : connexion (couche
// d'authentification, ADR 0024 — widget dérivé de la méthode d'auth), outils
// (toggles) et « à propos » (description + doc how-to). Réutilise les MÊMES widgets
// d'auth que l'ex-ConnectorCard (source unique, zéro branche par nom).
import { computed, ref } from 'vue'
import Btn from './Btn.vue'
import Toggle from './Toggle.vue'
import Quota from './Quota.vue'
import Avatar from './Avatar.vue'
import ConnectorOAuthAccounts from './ConnectorOAuthAccounts.vue'
import ConnectorFederatedWidget from './ConnectorFederatedWidget.vue'
import ConnectorSessionWidget from './ConnectorSessionWidget.vue'
import ConnectorHostedWidget from './ConnectorHostedWidget.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import { selectConnector, pauseConnector, unselectConnector, enableTool, disableTool } from '@/api/console'
import type { ConnectorMode } from '@/lib/consoleTypes'
import type { ConnectorState, MyConnector, ToolEntry } from '@/types/api'

const props = defineProps<{
  connector: MyConnector
  tools: (ToolEntry & { description?: string })[]
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'configure', c: MyConnector): void
  (e: 'remove', c: MyConnector): void
}>()

const { me } = useMe()
const { toast } = useToast()

type Tab = 'connection' | 'tools' | 'about'
const tab = ref<Tab>('connection')

const c = computed(() => props.connector)
const state = computed<ConnectorState>(() => props.connector.state)
const myTools = computed(() => [...props.tools].sort((a, b) => a.name.localeCompare(b.name)))
const enabledCount = computed(() => myTools.value.filter((t) => t.enabled).length)

// Widget de connexion à rendre — dérivé du descripteur d'auth unifié (ADR 0024).
type Conn = 'key' | 'session' | 'google' | 'memento' | 'unipile' | 'none'
const connKind = computed<Conn>(() => {
  switch (c.value.auth.method) {
    case 'hosted': return 'unipile'
    case 'cookie': return 'session'
    case 'oauth': return c.value.auth.cardinality === 'multi_account' ? 'google' : 'memento'
    case 'secret': return 'key'
    default: return 'none'   // none (open data) + remote (bridge d'org)
  }
})
const isOpenData = computed(() => c.value.auth.method === 'none')
const isRemote = computed(() => c.value.auth.method === 'remote')
const isOauthLike = computed(() => ['google', 'memento', 'session', 'unipile'].includes(connKind.value))

// Libellé court + explication de la méthode d'auth (couche Authentification).
const nFields = computed(() => (c.value.credential_fields ?? []).length)
const authLabel = computed(() => {
  switch (c.value.auth.method) {
    case 'secret': return nFields.value > 1 ? `${nFields.value} fields` : 'api key'
    case 'oauth': return c.value.auth.cardinality === 'multi_account' ? 'oauth · multi' : 'oauth'
    case 'cookie': return 'session'
    case 'hosted': return 'hosted account'
    case 'remote': return 'org bridge'
    default: return 'open data'
  }
})
const authExplain = computed(() => {
  switch (c.value.auth.method) {
    case 'secret': return nFields.value > 1
      ? `a ${nFields.value}-field credential you paste once — stored encrypted and scoped to this org.`
      : 'a single API key you paste once — stored encrypted and scoped to this org.'
    case 'oauth': return c.value.auth.cardinality === 'multi_account'
      ? 'authorize one or more accounts with OAuth — no key to copy.'
      : 'a one-time OAuth grant in your name — no key to copy.'
    case 'cookie': return 'your logged-in session, captured once through a hosted login window.'
    case 'hosted': return 'a hosted account bridge — link your account here, the access key resolves in cascade.'
    case 'remote': return 'a remote bridge whose credential is placed by your org — nothing to configure as a member.'
    default: return 'open data — no credential, tools work directly.'
  }
})

// Cascade de résolution de la clé (user > group > org > platform) — nœud gagnant.
const status = computed(() => me.value?.providers?.[c.value.name])
const statusMode = computed<ConnectorMode>(() => {
  const p = status.value
  if (!p || p.mode === 'forbidden') return 'none'
  if (p.mode === 'over_quota') return 'platform'
  return p.mode as ConnectorMode
})
const keyConfigured = computed(() => !!status.value?.user_key_configured)
const needsKey = computed(() => connKind.value === 'key')
function nodeCls(mode: ConnectorMode): string {
  return 'node' + (statusMode.value === mode ? ' win' : '')
}
const KEY_STATUS: Record<ConnectorMode, string> = {
  none: 'no key resolves yet — connect one below.',
  user: 'resolved by your own key, set in this org.',
  group: "resolved by your team's shared key.",
  org: "resolved by your org's shared key — you don't need your own.",
  platform: 'resolved by the oto platform key.',
}
const keyStatus = computed(() => KEY_STATUS[statusMode.value])

const docRefCount = computed(() => c.value.doctrine_ref_count ?? 0)

// Exposition (off/muted/live) = les 3 états de connector_selection.
const EXPOSURE = computed(() => {
  if (state.value === 'active') return { explain: `your agents currently see ${enabledCount.value} of ${myTools.value.length} tools from this connector.` }
  if (state.value === 'paused') return { explain: 'connected, but every tool is hidden from your agents right now. your selection is kept.' }
  return { explain: "not added to your workspace — your agents don't see it. set it live to expose its tools." }
})

async function setState(s: ConnectorState) {
  if (state.value === s) return
  try {
    if (s === 'active') await selectConnector(c.value.name)
    else if (s === 'paused') await pauseConnector(c.value.name)
    else await unselectConnector(c.value.name)
    props.connector.state = s
  } catch (e) { toast(humanize(e)) }
}

async function toggleTool(t: ToolEntry) {
  if (t.protected) return
  try {
    if (t.enabled) { await disableTool(t.name); t.enabled = false }
    else { await enableTool(t.name); t.enabled = true }
  } catch (e) { toast(humanize(e)) }
}
async function setAllTools(on: boolean) {
  const targets = myTools.value.filter((t) => !t.protected && t.enabled !== on)
  try {
    await Promise.all(targets.map((t) => (on ? enableTool(t.name) : disableTool(t.name))))
    targets.forEach((t) => { t.enabled = on })
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="backdrop" @click="emit('close')"></div>
  <aside class="drawer" role="dialog" aria-modal="true">
    <!-- header -->
    <div class="dr-head">
      <Avatar :src="c.logo_url" :name="c.label" :size="44" shape="square" />
      <div style="flex: 1; min-width: 0">
        <div class="dr-title">{{ c.label }}</div>
        <div class="dr-pub">{{ c.publisher }}</div>
        <div class="dr-tags">
          <span class="tag ink">{{ c.category }}</span>
          <span class="tag cobalt">{{ authLabel }}</span>
          <span v-if="c.family === 'federated'" class="tag saffron">federated</span>
          <span v-if="c.free_tier" class="tag olive">free · {{ c.free_tier.daily_quota }}/day</span>
        </div>
      </div>
      <button class="closebtn" aria-label="close" @click="emit('close')">×</button>
    </div>

    <!-- tabs -->
    <div class="dr-tabs">
      <button class="dtab" :class="{ on: tab === 'connection' }" @click="tab = 'connection'">connection</button>
      <button class="dtab" :class="{ on: tab === 'tools' }" @click="tab = 'tools'">tools <span class="dim">{{ enabledCount }}/{{ myTools.length }}</span></button>
      <button class="dtab" :class="{ on: tab === 'about' }" @click="tab = 'about'">about</button>
    </div>

    <div class="dr-scroll">
      <!-- exposure (toujours en tête) -->
      <div class="dr-block">
        <div class="eyebrow" style="margin-bottom: 9px">exposure — what your agents see</div>
        <div class="expseg">
          <button :class="{ on: state === 'not_selected', off: true }" @click="setState('not_selected')"><span class="cdot grey"></span><span class="el">off</span></button>
          <button :class="{ on: state === 'paused', muted: true }" @click="setState('paused')"><span class="cdot saffron"></span><span class="el">muted</span></button>
          <button :class="{ on: state === 'active', live: true }" @click="setState('active')"><span class="cdot olive"></span><span class="el">live</span></button>
        </div>
        <p class="helptext" style="margin-top: 9px">{{ EXPOSURE.explain }}</p>
      </div>

      <!-- CONNECTION -->
      <div v-if="tab === 'connection'" class="dr-block">
        <div class="eyebrow" style="margin-bottom: 8px">connection · {{ authLabel }}</div>
        <p class="helptext" style="margin: 0 0 14px">{{ authExplain }}</p>

        <div v-if="needsKey" class="dr-box">
          <div style="font-size: 12.5px; font-weight: 600; margin-bottom: 10px">key resolution — first match wins</div>
          <div class="cascade">
            <span :class="nodeCls('user')">you</span><span class="arr">→</span>
            <span :class="nodeCls('group')">team</span><span class="arr">→</span>
            <span :class="nodeCls('org')">org</span><span class="arr">→</span>
            <span :class="nodeCls('platform')">oto platform</span>
          </div>
          <p class="helptext" style="margin: 11px 0 0">{{ keyStatus }}<span v-if="statusMode === 'platform' && status?.platform_key_label" class="dim"> ({{ status.platform_key_label }})</span></p>
          <Quota v-if="status?.quota_daily" style="margin-top: 12px" :used="status.quota_used_today" :total="status.quota_daily" label="daily quota" />
          <div style="display: flex; gap: 8px; margin-top: 14px">
            <template v-if="keyConfigured">
              <Btn kind="mini" @click="emit('configure', c)">override key</Btn>
              <Btn kind="danger" @click="emit('remove', c)">remove key</Btn>
            </template>
            <Btn v-else kind="mini" @click="emit('configure', c)">connect {{ c.label }}</Btn>
          </div>
        </div>

        <ConnectorOAuthAccounts v-else-if="connKind === 'google'" />
        <ConnectorFederatedWidget v-else-if="connKind === 'memento'" :connector="c" />
        <ConnectorSessionWidget v-else-if="connKind === 'session'" :connector="c" />
        <ConnectorHostedWidget v-else-if="connKind === 'unipile'" />

        <div v-else-if="isRemote" class="dr-box dashed">
          <div style="display: flex; align-items: center; gap: 9px"><span class="cdot cobalt"></span><span style="font-size: 12.5px; font-weight: 600">org bridge — provisioned by your org</span></div>
          <p class="helptext" style="margin: 8px 0 0">your org admin places the machine credential; members just use it, read-only.</p>
        </div>
        <div v-else-if="isOpenData" class="dr-box dashed">
          <div style="display: flex; align-items: center; gap: 9px"><span class="cdot cobalt"></span><span style="font-size: 12.5px; font-weight: 600">open data — no credential needed</span></div>
          <p class="helptext" style="margin: 8px 0 0">tools work out of the box. flip exposure to <strong>live</strong> and your agents can call them immediately.</p>
        </div>

        <p v-if="docRefCount > 0" class="helptext" style="margin-top: 14px; color: var(--color-mute)">↳ referenced by <strong style="color: var(--color-ink-soft)">{{ docRefCount }}</strong> procedure{{ docRefCount > 1 ? 's' : '' }} — connect it to run them.</p>
      </div>

      <!-- TOOLS -->
      <div v-else-if="tab === 'tools'" class="dr-block">
        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px">
          <div class="eyebrow">{{ enabledCount }} of {{ myTools.length }} tools enabled</div>
          <div style="display: flex; gap: 12px">
            <button class="linklike" @click="setAllTools(true)">enable all</button>
            <button class="linklike" @click="setAllTools(false)">disable all</button>
          </div>
        </div>
        <p v-if="state === 'paused'" class="helptext" style="color: var(--color-saffron-ink); margin: 0 0 8px">this connector is muted — your selection is saved but hidden from agents until you set it live.</p>
        <div v-for="t in myTools" :key="t.name" class="trow">
          <div style="min-width: 0; flex: 1">
            <code class="mono" style="font-size: 12px; color: var(--color-ink-soft)">{{ t.name }}</code>
            <div v-if="t.description" style="font-size: 11px; line-height: 1.45; color: var(--color-mute); margin-top: 2px">{{ t.description }}</div>
            <span v-if="t.protected" class="tag" style="font-size: 8.5px; padding: 1.5px 6px; margin-top: 5px">always on</span>
          </div>
          <Toggle :on="t.enabled && state === 'active'" :disabled="t.protected" @change="toggleTool(t)" />
        </div>
        <p v-if="!myTools.length" class="helptext">no tools loaded for this connector.</p>
      </div>

      <!-- ABOUT -->
      <div v-else class="dr-block">
        <p style="font-size: 13.5px; line-height: 1.6; color: var(--color-ink-soft); margin: 0 0 16px; text-wrap: pretty">{{ c.description || c.help }}</p>
        <div v-for="d in (c.doc_sections ?? [])" :key="d.title" style="margin-bottom: 14px">
          <div class="eyebrow" style="margin-bottom: 5px">{{ d.title }}</div>
          <p class="helptext" style="margin: 0">{{ d.body_md }}</p>
        </div>
        <hr class="divider-dotted" style="margin: 16px 0" />
        <div style="display: flex; flex-wrap: wrap; gap: 24px">
          <div><div class="about-l">namespaces</div><div class="mono" style="font-size: 12px; margin-top: 4px">{{ c.namespaces.join(' · ') }}</div></div>
          <div><div class="about-l">tools</div><div class="mono" style="font-size: 12px; margin-top: 4px">{{ myTools.length }}</div></div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 55; background: rgba(44, 33, 18, .34); backdrop-filter: blur(2px); animation: bd-in var(--t-fast) var(--ease-out); }
@keyframes bd-in { from { opacity: 0; } to { opacity: 1; } }
.drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 60; width: min(520px, 94vw); background: var(--color-bg); border-left: 1px solid var(--color-hair); box-shadow: -18px 0 44px -18px rgba(44, 33, 18, .30); display: flex; flex-direction: column; animation: dr-in 240ms var(--ease-out); }
@keyframes dr-in { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.dr-head { padding: 16px 20px; border-bottom: 1px solid var(--color-hair); display: flex; align-items: flex-start; gap: 13px; }
.dr-title { font-size: 17px; font-weight: 700; letter-spacing: -.01em; line-height: 1.15; }
.dr-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; }
.dr-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.dr-tabs { display: flex; gap: 18px; padding: 0 20px; border-bottom: 1px solid var(--color-hair); }
.dtab { font-size: 12.5px; padding: 9px 2px 8px; border: 0; background: transparent; cursor: pointer; color: var(--color-mute); border-bottom: 2px solid transparent; margin-bottom: -1px; font-weight: 500; }
.dtab.on { color: var(--color-ink); border-bottom-color: var(--color-ink); font-weight: 700; }
.dr-scroll { flex: 1; overflow-y: auto; min-height: 0; }
.dr-block { padding: 18px 20px; border-bottom: 1px solid var(--color-hair-soft); }
.dr-box { border: 1px solid var(--color-hair); border-radius: 10px; padding: 14px; background: var(--color-surface); }
.dr-box.dashed { border-style: dashed; border-color: var(--color-hair-classic); }
.closebtn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--color-hair); background: var(--color-surface); color: var(--color-mute); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 17px; line-height: 1; flex: 0 0 auto; }
.closebtn:hover { background: var(--color-paper-2); color: var(--color-ink); }
.cdot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; flex: 0 0 auto; }
.cdot.olive { background: var(--color-olive); }
.cdot.saffron { background: var(--color-saffron); }
.cdot.cobalt { background: var(--color-cobalt); }
.cdot.grey { background: var(--color-hair-classic); }
.expseg { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.expseg button { border: 1px solid var(--color-hair); background: var(--color-surface); border-radius: 9px; padding: 9px 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; font-family: var(--font-sans); color: var(--color-mute); transition: border-color var(--t-fast), background var(--t-fast); }
.expseg button:hover { border-color: var(--color-ink-soft); }
.expseg button .el { font-size: 12.5px; font-weight: 600; }
.expseg button.on { color: var(--color-ink); }
.expseg button.on.live { border-color: var(--color-olive); background: var(--color-olive-soft); }
.expseg button.on.muted { border-color: var(--color-saffron); background: var(--color-saffron-soft); }
.expseg button.on.off { border-color: var(--color-ink-soft); background: var(--color-paper-2); }
.cascade { display: flex; align-items: center; gap: 0; flex-wrap: wrap; }
.cascade .node { font-family: var(--font-mono); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--color-hair); color: var(--color-faint); background: var(--color-surface); }
.cascade .node.win { border-color: var(--color-olive); color: var(--color-olive-ink); background: var(--color-olive-soft); font-weight: 700; }
.cascade .arr { color: var(--color-faint); font-size: 11px; padding: 0 5px; }
.trow { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--color-hair-soft); }
.trow:last-child { border-bottom: 0; }
.about-l { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--color-mute); }
.dim { color: var(--color-faint); font-weight: 500; }
</style>
