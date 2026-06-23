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
import ModeTag from './ModeTag.vue'
import Quota from './Quota.vue'
import ConnectorTransforms from './ConnectorTransforms.vue'
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
import type {
  ConnectorFieldSchema, ConnectorState, FieldActionSchema, FieldRule, MyConnector, ToolEntry,
} from '@/types/api'

const props = defineProps<{
  connector: MyConnector
  tools: ToolEntry[]
  // Onglet « transformations » (redaction de champs, ADR 0015) — données fournies par le parent.
  fieldSchema?: ConnectorFieldSchema[]
  fieldRules?: FieldRule[]
  fieldFiltersCustomized?: boolean
  actionSchema?: FieldActionSchema[]
  orgId?: number | null
  isOrgAdmin?: boolean
}>()
// Le credential keyé reste géré par le parent (formulaire). Les flux non-keyés
// (oauth/session/hosted) sont rendus INLINE par des widgets auto-suffisants.
const emit = defineEmits<{
  (e: 'configure', c: MyConnector): void
  (e: 'remove', c: MyConnector): void
  (e: 'filters-changed'): void
}>()

type Tab = 'conn' | 'tools' | 'transforms'
const tab = ref<Tab>('conn')

const { me } = useMe()
const { toast } = useToast()

const monogram = computed(() => (props.connector.label || props.connector.name).charAt(0).toUpperCase())
const state = computed<ConnectorState>(() => props.connector.state)

// Face credential : d'où vient la connexion de ce connecteur. Dérivée des champs du
// registre (ConnectorMeta) — aucune branche par nom de connecteur côté backend.
type Conn = 'key' | 'session' | 'google' | 'memento' | 'unipile' | 'none'
const connKind = computed<Conn>(() => {
  const c = props.connector
  if (c.name === 'unipile') return 'unipile'
  if ((c.credential_fields?.length ?? 0) > 0) return 'key'
  if (c.secret_kind === 'oauth') return c.personal_session ? 'google' : 'memento'
  if (c.secret_kind === 'cookie' || c.personal_session) return 'session'
  return 'none'
})

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

const myTools = computed(() => [...props.tools].sort((a, b) => a.name.localeCompare(b.name)))
const enabledCount = computed(() => myTools.value.filter((t) => t.enabled).length)

// L'onglet transformations n'apparaît que pour les connecteurs concernés par la redaction
// (schéma déclaré ou règle déjà posée).
const hasTransforms = computed(() =>
  (props.fieldSchema?.length ?? 0) > 0 || (props.fieldRules?.length ?? 0) > 0)

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
  try {
    if (t.enabled) { await disableTool(t.name); t.enabled = false }
    else { await enableTool(t.name); t.enabled = true }
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <article class="cc-card" :class="{ off: state === 'not_selected' }">
    <header class="cc-head">
      <div class="cc-logo">
        <img v-if="connector.logo_url" :src="connector.logo_url" :alt="connector.label" loading="lazy" />
        <span v-else class="cc-mono">{{ monogram }}</span>
      </div>
      <div class="cc-id">
        <div class="cc-name">{{ connector.label }}
          <Tag v-if="connector.recommended" tone="cobalt">recommended</Tag>
        </div>
        <div class="cc-pub">{{ connector.publisher }} · {{ connector.help }}</div>
      </div>
      <!-- Sélecteur des 3 états : actif | masqué | désactivé (défaut) -->
      <div class="cc-seg" role="radiogroup" aria-label="connector state">
        <button :class="{ on: state === 'active' }" @click="setState('active')">active</button>
        <button :class="{ on: state === 'paused' }" @click="setState('paused')">hidden</button>
        <button :class="{ on: state === 'not_selected' }" @click="setState('not_selected')">off</button>
      </div>
    </header>

    <div v-if="state !== 'not_selected'" class="cc-body">
      <!-- Barre d'onglets : connexion / outils / transformations -->
      <div class="cc-tabs" role="tablist">
        <button :class="{ on: tab === 'conn' }" @click="tab = 'conn'">connexion</button>
        <button :class="{ on: tab === 'tools' }" @click="tab = 'tools'">
          outils <span class="dim">{{ enabledCount }}/{{ myTools.length }}</span>
        </button>
        <button v-if="hasTransforms" :class="{ on: tab === 'transforms' }" @click="tab = 'transforms'">
          transformations
        </button>
      </div>

      <!-- Onglet 1 — config de la connexion -->
      <div v-show="tab === 'conn'" class="cc-conn">
        <template v-if="connKind === 'key'">
          <ModeTag :mode="statusMode" />
          <span v-if="status?.platform_key_label" class="dim cc-pk">{{ status.platform_key_label }}</span>
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
      </div>

      <!-- Onglet 2 — paramétrage des outils -->
      <div v-show="tab === 'tools'" class="cc-tools">
        <div v-if="state === 'paused'" class="cc-tools-head">
          <span class="dim cc-paused">hidden from your agents</span>
        </div>
        <div v-for="t in myTools" :key="t.name" class="cc-tool" :class="{ muted: state === 'paused' }">
          <code class="mono cc-tname">{{ t.name }}</code>
          <Toggle :on="t.enabled && state === 'active'" @change="toggleTool(t)" />
        </div>
        <p v-if="!myTools.length" class="cc-no-tools dim">no tools loaded for this connector.</p>
      </div>

      <!-- Onglet 3 — transformations (redaction de champs) -->
      <!-- Rédaction en LECTURE SEULE côté user — l'édition vit dans /org/connectors (ADR 0022). -->
      <ConnectorTransforms v-if="hasTransforms" v-show="tab === 'transforms'" readonly
        :service="connector.name" :fields="fieldSchema ?? []" :rules="fieldRules ?? []"
        :action-schema="actionSchema ?? []" :customized="fieldFiltersCustomized ?? false"
        :org-id="orgId ?? null" :is-org-admin="isOrgAdmin ?? false" />
    </div>
  </article>
</template>

<style scoped>
.cc-card { border: 1px solid var(--color-hair); border-radius: 12px; background: var(--color-paper); overflow: hidden; }
.cc-card.off { background: var(--color-surface); opacity: 0.78; }
.cc-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
.cc-logo {
  width: 36px; height: 36px; border-radius: 9px; flex: 0 0 auto; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-hair); background: var(--color-surface);
}
.cc-logo img { width: 100%; height: 100%; object-fit: contain; }
.cc-mono { font-family: var(--font-mono); font-weight: 700; font-size: 15px; color: var(--color-ink-soft); }
.cc-id { flex: 1; min-width: 0; }
.cc-name { font-weight: 600; font-size: 14px; line-height: 1.2; display: flex; gap: 8px; align-items: center; }
.cc-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-seg { display: inline-flex; border: 1px solid var(--color-hair-classic); border-radius: 999px; overflow: hidden; flex: 0 0 auto; }
.cc-seg button {
  font-size: 11px; padding: 4px 10px; border: 0; background: transparent; cursor: pointer;
  color: var(--color-mute); border-left: 1px solid var(--color-hair-soft);
}
.cc-seg button:first-child { border-left: 0; }
.cc-seg button.on { background: var(--color-ink); color: var(--color-paper); font-weight: 600; }
.cc-body { padding: 0 14px 14px; }
.cc-tabs { display: flex; gap: 2px; border-top: 1px solid var(--color-hair-soft); margin-bottom: 8px; }
.cc-tabs button {
  font-size: 11.5px; padding: 7px 10px 6px; border: 0; background: transparent; cursor: pointer;
  color: var(--color-mute); border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.cc-tabs button.on { color: var(--color-ink); border-bottom-color: var(--color-ink); font-weight: 600; }
.cc-conn { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 2px 0 6px; }
.cc-pk { font-size: 11px; }
.cc-quota { min-width: 120px; }
.cc-actions { margin-left: auto; display: flex; gap: 6px; }
.cc-tools { display: flex; flex-direction: column; gap: 5px; }
.cc-tools-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: 600; margin-bottom: 2px; }
.cc-paused { font-weight: 400; }
.cc-tool { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--color-hair-soft); }
.cc-tool.muted .cc-tname { color: var(--color-faint); }
.cc-tname { font-size: 12px; color: var(--color-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-no-tools { font-size: 12px; margin: 4px 0 0; }
</style>
