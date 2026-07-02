<script setup lang="ts">
// Carte unifiée d'UN connecteur (fusion connecteurs + toolbox) : un connecteur est
// UNE chose à deux faces — la **config de la connexion** (credential) et le
// **paramétrage de ses outils** (toolbox). La carte porte les deux, plus le
// sélecteur des 3 états (actif / masqué / désactivé) câblé sur connector_selection
// (ADR 0019) : active = outils exposés ; paused = installé mais outils cachés de
// l'agent ; not_selected = désactivé, le défaut.
import { computed, ref } from 'vue'
import Toggle from './Toggle.vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import Quota from './Quota.vue'
import ConnectorCardShell from './ConnectorCardShell.vue'
import ConnectorOAuthAccounts from './ConnectorOAuthAccounts.vue'
import ConnectorFederatedWidget from './ConnectorFederatedWidget.vue'
import ConnectorSessionWidget from './ConnectorSessionWidget.vue'
import ConnectorHostedWidget from './ConnectorHostedWidget.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import {
  selectConnector, pauseConnector, unselectConnector, enableTool, disableTool,
} from '@/api/console'
import type { ConnectorMode } from '@/lib/consoleTypes'
import type { ConnectorState, MyConnector, ToolEntry } from '@/types/api'

const props = defineProps<{
  connector: MyConnector
  // `description` (registre résolu ADR 0014) : ce que FAIT l'outil, affiché
  // sous son nom — un toggle nu ne dit rien.
  tools: (ToolEntry & { description?: string })[]
}>()
// Le credential keyé reste géré par le parent (formulaire). Les flux non-keyés
// (oauth/session/hosted) sont rendus INLINE par des widgets auto-suffisants.
const emit = defineEmits<{
  (e: 'configure', c: MyConnector): void
  (e: 'remove', c: MyConnector): void
}>()

type Tab = 'conn' | 'tools'
const tab = ref<Tab>('conn')

const { me } = useMe()
const { toast } = useToast()

const state = computed<ConnectorState>(() => props.connector.state)

// Face credential : quel widget rendre. DÉRIVÉE du descripteur d'auth unifié
// (ADR 0024) — source unique côté backend (`Connector.auth`), zéro branche par
// nom de connecteur ici. `method` pilote le flux ; `cardinality=multi_account`
// distingue l'oauth multi-compte (google) de l'oauth fédéré single (memento).
type Conn = 'key' | 'session' | 'google' | 'memento' | 'unipile' | 'none'
const connKind = computed<Conn>(() => {
  const a = props.connector.auth
  switch (a.method) {
    case 'hosted': return 'unipile'
    case 'cookie': return 'session'
    case 'oauth': return a.cardinality === 'multi_account' ? 'google' : 'memento'
    case 'secret': return 'key'
    default: return 'none'   // none + remote (bridge, credential détenu par l'org)
  }
})
// Libellé de la méthode d'auth (couche Authentification, ADR 0024) — nomme le flux.
const AUTH_LABEL: Record<Conn, string> = {
  key: 'authentification · clé api',
  google: 'authentification · oauth (multi-compte)',
  memento: 'authentification · mcp fédéré',
  session: 'authentification · session',
  unipile: 'authentification · hébergé',
  none: 'authentification · open data (aucune)',
}
const authLabel = computed(() => AUTH_LABEL[connKind.value])

// Statut de résolution de la clé (cascade user > group > org > platform) pour les
// connecteurs keyés — alimente le tag de source + le quota.
const status = computed(() => me.value?.providers?.[props.connector.name])
const statusMode = computed<ConnectorMode>(() => {
  const p = status.value
  if (!p || p.mode === 'forbidden') return 'none'
  if (p.mode === 'over_quota') return 'platform'
  return p.mode as ConnectorMode
})
const keyConfigured = computed(() => !!status.value?.user_key_configured)

// Quelle clé est RÉSOLUE pour ce connecteur (membre / équipe / org / plateforme), en
// clair — retour user : « on ne sait pas si on a la clé plateforme, org ou perso ».
// « perso » n'existe plus (ADR 0033) : la clé d'un membre est scopée à l'org courante
// — posée dans une autre org, elle n'y résout pas (mode `user` = ta clé DANS cette org).
const KEY_SOURCE: Record<ConnectorMode, string> = {
  user: 'ta clé (posée dans cette org)',
  group: 'la clé de ton équipe',
  org: 'la clé de ton org',
  platform: 'la clé plateforme oto',
  none: 'aucune — à configurer',
}
const keySource = computed(() => KEY_SOURCE[statusMode.value])

// Posture « doctrine-only » (ADR 0024) : un connecteur peut être référencé par des
// doctrines (`<tool:slug>`) sans être connecté — utile à l'écriture de doctrines.
const docRefCount = computed(() => props.connector.doctrine_ref_count ?? 0)

const myTools = computed(() => [...props.tools].sort((a, b) => a.name.localeCompare(b.name)))
const enabledCount = computed(() => myTools.value.filter((t) => t.enabled).length)

async function setState(s: ConnectorState) {
  if (state.value === s) return
  try {
    if (s === 'active') await selectConnector(props.connector.name)
    else if (s === 'paused') await pauseConnector(props.connector.name)
    else await unselectConnector(props.connector.name)
    props.connector.state = s
  } catch (e) { toast(humanize(e)) }
}

async function toggleTool(t: ToolEntry) {
  if (t.protected) return // anti-lockout / boucle d'usage : jamais désactivable
  try {
    if (t.enabled) { await disableTool(t.name); t.enabled = false }
    else { await enableTool(t.name); t.enabled = true }
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConnectorCardShell
    :label="connector.label"
    :logo-url="connector.logo_url"
    :subtitle="`${connector.publisher} · ${connector.help}`"
    :off="state === 'not_selected'"
    :collapsed="state === 'not_selected'">
    <template #badges>
      <!-- Catégorie métier curée (registre `category`, ADR 0011) — axe de lecture
           commun aux 3 projections de connecteur. -->
      <Tag v-if="connector.category" tone="ink">{{ connector.category }}</Tag>
      <!-- Posture fédérée (ADR 0024) : login délégué + outils proxifiés, mais
           toujours sous gouvernance oto (redaction/calllog). -->
      <Tag v-if="connector.family === 'federated'" tone="saffron" title="mcp fédéré — login délégué, outils proxifiés sous gouvernance oto">fédéré</Tag>
      <!-- Free-tier (ADR 0031) : clé plateforme oto offerte, quota gratuit/jour/user. -->
      <Tag v-if="connector.free_tier" tone="olive" :title="`clé plateforme oto offerte — ${connector.free_tier.daily_quota}/jour gratuits par utilisateur, sans poser ta clé`">gratuit · {{ connector.free_tier.daily_quota }}/j</Tag>
    </template>
    <template #header-right>
      <!-- Sélecteur des 3 états : actif | masqué | désactivé (défaut) -->
      <div class="cc-seg" role="radiogroup" aria-label="connector state">
        <button :class="{ on: state === 'active' }" @click="setState('active')">active</button>
        <button :class="{ on: state === 'paused' }" @click="setState('paused')">hidden</button>
        <button :class="{ on: state === 'not_selected' }" @click="setState('not_selected')">off</button>
      </div>
    </template>

    <!-- Corps : onglets connexion / outils -->
    <div class="cc-tabs" role="tablist">
      <button :class="{ on: tab === 'conn' }" @click="tab = 'conn'">connexion</button>
      <button :class="{ on: tab === 'tools' }" @click="tab = 'tools'">
        outils <span class="dim">{{ enabledCount }}/{{ myTools.length }}</span>
      </button>
    </div>

    <!-- Onglet 1 — config de la connexion (couche Authentification, ADR 0024) -->
    <div v-show="tab === 'conn'" class="cc-conn">
        <span class="cc-authkind">{{ authLabel }}</span>
        <template v-if="connKind === 'key'">
          <span class="cc-keysrc">clé utilisée : <strong>{{ keySource }}</strong><span v-if="statusMode === 'platform' && status?.platform_key_label" class="dim"> ({{ status.platform_key_label }})</span></span>
          <Quota v-if="status?.quota_daily" class="cc-quota"
            :used="status.quota_used_today" :total="status.quota_daily" label="" />
          <span class="cc-actions">
            <Btn v-if="keyConfigured" kind="danger" @click="emit('remove', connector)">remove key</Btn>
            <Btn v-else-if="statusMode === 'none'" kind="mini" @click="emit('configure', connector)">configure</Btn>
            <Btn v-else kind="mini" @click="emit('configure', connector)">override key</Btn>
          </span>
        </template>
        <template v-else-if="connKind === 'none'">
          <span class="dim">no credential needed — open data.</span>
        </template>
        <!-- Tous les flux d'auth sont édités INLINE sur la carte (ADR 0024) — plus de
             carte ancrée : un widget par méthode, dérivé de connKind. -->
        <template v-else-if="connKind === 'google'">
          <ConnectorOAuthAccounts />
        </template>
        <template v-else-if="connKind === 'memento'">
          <ConnectorFederatedWidget :connector="connector" />
        </template>
        <template v-else-if="connKind === 'session'">
          <ConnectorSessionWidget :connector="connector" />
        </template>
        <template v-else-if="connKind === 'unipile'">
          <ConnectorHostedWidget />
        </template>
        <!-- Posture procédure-only : référencé par des procédures même non connecté. -->
        <div v-if="docRefCount > 0" class="cc-docref dim">
          ↳ referenced by {{ docRefCount }} procedure{{ docRefCount > 1 ? 's' : '' }} — connect it to run them
        </div>
      </div>

      <!-- Onglet 2 — paramétrage des outils -->
      <div v-show="tab === 'tools'" class="cc-tools">
        <div v-if="state === 'paused'" class="cc-tools-head">
          <span class="dim cc-paused">hidden from your agents</span>
        </div>
        <div v-for="t in myTools" :key="t.name" class="cc-tool" :class="{ muted: state === 'paused' }">
          <div class="cc-tmeta">
            <code class="mono cc-tname">{{ t.name }}</code>
            <span v-if="t.description" class="cc-tdesc">{{ t.description }}</span>
          </div>
          <Toggle :on="t.enabled && state === 'active'" :disabled="t.protected" @change="toggleTool(t)" />
        </div>
        <p v-if="!myTools.length" class="cc-no-tools dim">no tools loaded for this connector.</p>
      </div>
  </ConnectorCardShell>
</template>

<style scoped>
/* Le chrome (carte/header/logo/nom) vit dans ConnectorCardShell. Ici : le corps user. */
.cc-seg { display: inline-flex; border: 1px solid var(--color-hair-classic); border-radius: 999px; overflow: hidden; flex: 0 0 auto; }
.cc-seg button {
  font-size: 11px; padding: 4px 10px; border: 0; background: transparent; cursor: pointer;
  color: var(--color-mute); border-left: 1px solid var(--color-hair-soft);
}
.cc-seg button:first-child { border-left: 0; }
.cc-seg button.on { background: var(--color-ink); color: var(--color-paper); font-weight: 600; }
.cc-tabs { display: flex; gap: 2px; border-top: 1px solid var(--color-hair-soft); margin-bottom: 8px; }
.cc-tabs button {
  font-size: 11.5px; padding: 7px 10px 6px; border: 0; background: transparent; cursor: pointer;
  color: var(--color-mute); border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.cc-tabs button.on { color: var(--color-ink); border-bottom-color: var(--color-ink); font-weight: 600; }
.cc-conn { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 2px 0 6px; }
.cc-authkind { flex-basis: 100%; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-faint); }
.cc-docref { flex-basis: 100%; font-size: 11px; }
.cc-keysrc { font-size: 12px; }
.cc-quota { min-width: 120px; }
.cc-actions { margin-left: auto; display: flex; gap: 6px; }
.cc-tools { display: flex; flex-direction: column; gap: 5px; }
.cc-tools-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: 600; margin-bottom: 2px; }
.cc-paused { font-weight: 400; }
.cc-tool { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--color-hair-soft); }
.cc-tool.muted .cc-tname { color: var(--color-faint); }
.cc-tmeta { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cc-tname { font-size: 12px; color: var(--color-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-tdesc {
  font-size: 11px; line-height: 1.4; color: var(--color-mute);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.cc-tool.muted .cc-tdesc { color: var(--color-faint); }
.cc-no-tools { font-size: 12px; margin: 4px 0 0; }
</style>
