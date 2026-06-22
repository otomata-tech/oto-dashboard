<script setup lang="ts">
// Connecteurs — surface UNIFIÉE (fusion ex-/connectors + ex-/toolbox + ex-/my-connectors).
// Un connecteur = UNE chose à deux faces : config de la connexion (credential) ET
// paramétrage de ses outils (toolbox). Chaque connecteur est une carte (ConnectorCard)
// portant les deux + le sélecteur 3 états (actif/masqué/désactivé, ADR 0019). Les flux
// de connexion à carte dédiée (sessions, google, messagerie unipile, mcp fédéré) restent
// en bas, ancrés (la carte y pointe). Presets de toolbox tout en bas. Les tokens CLI ont
// migré vers le hub compte (/account) — ils sont user-scopés, pas org-scopés.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import ConnectorCard from '@/components/console/ConnectorCard.vue'
import Stat from '@/components/console/Stat.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import {
  getMyConnectors, getTools, getPresets, setCredential, deleteApiKey,
  deleteLinkedin, deleteCrunchbase,
  getGoogleStatus, startGoogleOauth, setGoogleDefault, revokeGoogle,
  getFederatedStatus, startFederatedOauth, disconnectFederated,
  getUnipileStatus, subscribeUnipile, connectUnipile, disconnectUnipile,
  applyPreset as applyPresetApi, savePreset, deletePreset,
  getOrgFieldFilters,
} from '@/api/console'
import type {
  ConnectorState, FieldFiltersBundle, GoogleOauthStatus, MementoStatus, MyConnector,
  PresetEntry, ToolEntry, UnipileStatus,
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
const google = ref<GoogleOauthStatus | null>(null)
const fedStatus = ref<Record<string, MementoStatus>>({})
const unipile = ref<UnipileStatus | null>(null)
const fieldFilters = ref<FieldFiltersBundle | null>(null)
const error = ref<string | null>(null)
const q = ref('')

const activeOrgId = computed(() => me.value?.active_org ?? null)
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin' || me.value?.role === 'admin')

const nsOf = (toolName: string): string => toolName.split('_')[0] ?? toolName
function toolsOf(c: MyConnector): ToolEntry[] {
  const ns = new Set(c.namespaces)
  return tools.value.filter((t) => ns.has(nsOf(t.name)))
}

// Transformations (redaction) du connecteur : schéma déclaré + règles effectives
// (politique de l'org si posée, sinon défaut serveur).
function transformsOf(c: MyConnector) {
  const b = fieldFilters.value
  return {
    schema: b?.schemas?.[c.name] ?? [],
    rules: b?.filters?.[c.name]?.rules ?? b?.defaults?.[c.name]?.rules ?? [],
    customized: !!b?.filters?.[c.name],
  }
}
async function reloadFieldFilters() {
  if (activeOrgId.value == null) { fieldFilters.value = null; return }
  fieldFilters.value = await getOrgFieldFilters(activeOrgId.value).catch(() => null)
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
    const [mc, tl, pr, g, u, ff] = await Promise.all([
      getMyConnectors(), getTools(), getPresets().catch(() => ({ presets: [] })),
      getGoogleStatus().catch(() => null),
      getUnipileStatus().catch(() => null),
      activeOrgId.value == null ? Promise.resolve(null) : getOrgFieldFilters(activeOrgId.value).catch(() => null),
    ])
    catalog.value = mc.connectors
    tools.value = tl.tools
    presets.value = pr.presets
    google.value = g
    unipile.value = u
    fieldFilters.value = ff
    await loadFederated()
  } catch (e) { error.value = humanize(e) }
}
onMounted(async () => {
  // Retour des flux OAuth (mcp fédéré) / hosted-auth (unipile) — toast + poll.
  const sp = new URLSearchParams(window.location.search)
  const up = sp.get('unipile')
  const upCh = (sp.get('channel') || 'linkedin') as keyof UnipileStatus['channels']
  if (up === 'connected') {
    for (let i = 0; i < 5; i++) {
      unipile.value = await getUnipileStatus().catch(() => unipile.value)
      if (unipile.value?.channels?.[upCh]?.connected) break
      await new Promise((r) => setTimeout(r, 1200))
    }
    toast(unipile.value?.channels?.[upCh]?.connected ? `${upCh} connecté via unipile` : 'connexion en cours — rafraîchis dans un instant')
  } else if (up === 'failed') toast(`échec de la connexion ${upCh}`)
  else if (up === 'subscribed') {
    for (let i = 0; i < 5; i++) {
      unipile.value = await getUnipileStatus().catch(() => unipile.value)
      if (unipile.value?.subscribed) break
      await new Promise((r) => setTimeout(r, 1200))
    }
    toast(unipile.value?.subscribed ? 'option messagerie activée' : 'activation en cours — rafraîchis dans un instant')
  } else if (up === 'cancel') toast('activation annulée')
  await load()
  // Retour OAuth d'un mcp fédéré : ?<name>=connected|error (name = connecteur du catalogue).
  let touched = up != null
  for (const c of federated.value) {
    const v = sp.get(c.name)
    if (!v) continue
    touched = true
    if (v === 'connected') toast(`${c.label} connecté`)
    else if (v === 'error') toast(`échec de la connexion ${c.label}`)
  }
  if (touched) window.history.replaceState({}, '', window.location.pathname)
})

function goto(section: string) {
  document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

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

// ── sessions ──
async function dropLinkedin() {
  if (!await confirmAction({ title: 'disconnect LinkedIn', danger: true, confirmLabel: 'disconnect', message: 'disconnect your linkedin session?' })) return
  try { await deleteLinkedin(); toast('linkedin session removed'); await reload() } catch (e) { toast(humanize(e)) }
}
async function dropCrunchbase() {
  if (!await confirmAction({ title: 'disconnect Crunchbase', danger: true, confirmLabel: 'disconnect', message: 'disconnect your crunchbase session?' })) return
  try { await deleteCrunchbase(); toast('crunchbase session removed'); await reload() } catch (e) { toast(humanize(e)) }
}

// ── google ──
async function linkGoogle() {
  try { const { auth_url } = await startGoogleOauth(); window.location.href = auth_url } catch (e) { toast(humanize(e)) }
}
async function makeDefault(email: string) {
  try { await setGoogleDefault(email); toast('default account updated'); google.value = await getGoogleStatus() } catch (e) { toast(humanize(e)) }
}
async function unlinkGoogle(email: string) {
  if (!await confirmAction({ title: 'revoke google account', danger: true, confirmLabel: 'revoke', message: `revoke ${email}? tools using it will lose access.` })) return
  try { await revokeGoogle(email); toast('grant revoked'); google.value = await getGoogleStatus() } catch (e) { toast(humanize(e)) }
}

// ── mcp fédéré générique (memento, atlassian…) — câblé par connecteur ──
async function loadFederated() {
  const entries = await Promise.all(
    federated.value.map(async (c) => [c.name, await getFederatedStatus(c.name).catch(() => null)] as const),
  )
  fedStatus.value = Object.fromEntries(entries.filter(([, s]) => s !== null)) as Record<string, MementoStatus>
}
async function linkFederated(name: string) {
  try { const { auth_url } = await startFederatedOauth(name); window.location.href = auth_url } catch (e) { toast(humanize(e)) }
}
async function dropFederated(c: MyConnector) {
  if (!await confirmAction({ title: `disconnect ${c.label}`, danger: true, confirmLabel: 'disconnect', message: `disconnect your ${c.label}? its tools will disappear from your session.` })) return
  try {
    await disconnectFederated(c.name)
    toast(`${c.label} disconnected`)
    fedStatus.value = { ...fedStatus.value, [c.name]: await getFederatedStatus(c.name) }
  } catch (e) { toast(humanize(e)) }
}

// ── messagerie unipile ──
async function activateUnipile() {
  try { const { checkout_url } = await subscribeUnipile(); window.location.href = checkout_url } catch (e) { toast(humanize(e)) }
}
async function linkUnipile(channel: string) {
  try { const { url } = await connectUnipile(channel); window.location.href = url } catch (e) { toast(humanize(e)) }
}
async function dropUnipile(channel: string) {
  if (!await confirmAction({ title: `disconnect ${channel} (unipile)`, danger: true, confirmLabel: 'disconnect', message: `disconnect your ${channel}? the unipile tools will stop acting as you on this channel.` })) return
  try { await disconnectUnipile(channel); toast(`${channel} disconnected`); unipile.value = await getUnipileStatus() } catch (e) { toast(humanize(e)) }
}
const hasUnipile = computed(() => catalog.value.some((c) => c.name === 'unipile'))
const unipileChannels = [
  { key: 'linkedin', label: 'linkedin', desc: 'search, scrape & message as you' },
  { key: 'whatsapp', label: 'whatsapp', desc: 'read & send messages as you' },
  { key: 'telegram', label: 'telegram', desc: 'read & send messages as you' },
  { key: 'instagram', label: 'instagram', desc: 'read & send DMs as you' },
  { key: 'messenger', label: 'messenger', desc: 'read & send messages as you' },
  { key: 'twitter', label: 'x / twitter', desc: 'read & send DMs as you' },
] as const
const federated = computed(() => catalog.value.filter((c) => c.secret_kind === 'oauth' && !c.personal_session))

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
          :field-schema="transformsOf(c).schema" :field-rules="transformsOf(c).rules"
          :field-filters-customized="transformsOf(c).customized" :action-schema="fieldFilters?.schema ?? []"
          :org-id="activeOrgId" :is-org-admin="isOrgAdmin"
          @configure="configure" @remove="removeKey" @goto="goto" @filters-changed="reloadFieldFilters" />
      </div>
      <p v-if="!shown.length" class="helptext" style="text-align: center; padding: 16px">no connector matches “{{ q }}”.</p>
    </ConsoleCard>

    <!-- ── flux de connexion à carte dédiée (ancrés ; les cartes y pointent) ── -->
    <div id="sessions" class="grid2">
      <ConsoleCard title="sessions" sub="per-user browser sessions — never shared with your org.">
        <div class="rowlist">
          <div class="rowitem" style="gap: 12px">
            <Dot :tone="me?.linkedin.configured ? 'olive' : 'faint'" :size="8" />
            <div style="min-width: 0; flex: 1">
              <div style="font-weight: 600; font-size: 13px">linkedin</div>
              <div style="font-size: 11.5px; color: var(--color-mute)">
                {{ me?.linkedin.configured ? `set ${fmtDate(me.linkedin.set_at) ?? ''} · voyager cookies` : 'no session — link via the extension' }}
              </div>
            </div>
            <Btn v-if="me?.linkedin.configured" kind="danger" @click="dropLinkedin">disconnect</Btn>
            <Btn v-else kind="mini" @click="toast('use the oto companion extension to capture your session')">connect</Btn>
          </div>
          <div class="rowitem" style="gap: 12px">
            <Dot :tone="me?.crunchbase.configured ? 'olive' : 'faint'" :size="8" />
            <div style="min-width: 0; flex: 1">
              <div style="font-weight: 600; font-size: 13px">crunchbase</div>
              <div style="font-size: 11.5px; color: var(--color-mute)">
                {{ me?.crunchbase.configured ? `set ${fmtDate(me.crunchbase.set_at) ?? ''}` : 'no session — company funding & profiles' }}
              </div>
            </div>
            <Btn v-if="me?.crunchbase.configured" kind="danger" @click="dropCrunchbase">disconnect</Btn>
            <Btn v-else kind="mini" @click="toast('capture your crunchbase cookies via the extension')">connect</Btn>
          </div>
        </div>
      </ConsoleCard>

      <ConsoleCard id="google" title="google accounts" sub="oauth grants used by gmail, drive, sheets and calendar tools.">
        <template #actions><Btn kind="mini" icon="plus" @click="linkGoogle">link account</Btn></template>
        <div v-if="google?.accounts?.length" class="rowlist">
          <div v-for="g in google.accounts" :key="g.email || ''" class="rowitem" style="gap: 12px">
            <Dot tone="olive" :size="8" />
            <div style="min-width: 0; flex: 1">
              <div style="font-weight: 600; font-size: 13px; display: flex; gap: 8px; align-items: center">
                {{ g.email }} <Tag v-if="g.is_default" tone="saffron">default</Tag>
              </div>
              <div style="font-size: 11.5px; color: var(--color-mute)">{{ g.scopes.join(' · ') }} · granted {{ fmtDate(g.granted_at) }}</div>
            </div>
            <Btn v-if="!g.is_default" kind="mini" @click="makeDefault(g.email!)">make default</Btn>
            <Btn kind="danger" @click="unlinkGoogle(g.email!)">revoke</Btn>
          </div>
        </div>
        <div v-else class="helptext">no google account linked yet — link one to unlock gmail, drive & sheets tools.</div>
      </ConsoleCard>
    </div>

    <ConsoleCard v-if="federated.length" id="federated" title="federated mcp"
      sub="connect another mcp to your oto — its tools mount into your session, scoped to your own account.">
      <div class="rowlist">
        <div v-for="c in federated" :key="c.name" class="rowitem" style="gap: 12px">
          <Dot :tone="fedStatus[c.name]?.connected ? 'olive' : 'faint'" :size="8" />
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 600; font-size: 13px; display: flex; gap: 8px; align-items: center">
              {{ c.label }} <Tag tone="cobalt">mcp</Tag>
            </div>
            <div style="font-size: 11.5px; color: var(--color-mute)">
              {{ fedStatus[c.name]?.connected ? `connected ${fmtDate(fedStatus[c.name]?.set_at) ?? ''} · ${c.help}` : c.help }}
            </div>
          </div>
          <Btn v-if="fedStatus[c.name]?.connected" kind="danger" @click="dropFederated(c)">disconnect</Btn>
          <Btn v-else kind="mini" @click="linkFederated(c.name)">connect</Btn>
        </div>
      </div>
    </ConsoleCard>

    <ConsoleCard v-if="hasUnipile" id="messaging" title="messaging (unipile)"
      sub="a paid add-on — hosted login (no cookie, no extension) for linkedin & whatsapp; the unipile tools then act as you. degressive €15 / €10 / €7 per connected account per month. mcp call credits apply on top.">
      <template #actions>
        <Btn v-if="!unipile?.subscribed" kind="mini" @click="activateUnipile">activate · from €15/mo</Btn>
      </template>
      <div class="rowlist">
        <div v-for="c in unipileChannels" :key="c.key" class="rowitem" style="gap: 12px">
          <Dot :tone="unipile?.channels?.[c.key]?.connected ? 'olive' : (unipile?.subscribed ? 'saffron' : 'faint')" :size="8" />
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 600; font-size: 13px; display: flex; gap: 8px; align-items: center">
              {{ c.label }} <Tag tone="cobalt">hosted</Tag>
              <Tag v-if="unipile?.channels?.[c.key]?.connected" tone="olive">connected</Tag>
            </div>
            <div style="font-size: 11.5px; color: var(--color-mute)">
              {{ !unipile?.subscribed
                ? 'activate the option above to connect'
                : (unipile?.channels?.[c.key]?.connected
                  ? `connected ${fmtDate(unipile?.channels?.[c.key]?.connected_at ?? null) ?? ''} · ${c.desc}`
                  : `option active — link your ${c.label} to start`) }}
            </div>
          </div>
          <template v-if="unipile?.subscribed">
            <Btn v-if="unipile?.channels?.[c.key]?.connected" kind="danger" @click="dropUnipile(c.key)">disconnect</Btn>
            <Btn v-else kind="mini" @click="linkUnipile(c.key)">connect</Btn>
          </template>
        </div>
      </div>
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
