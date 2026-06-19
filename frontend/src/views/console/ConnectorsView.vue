<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Quota from '@/components/console/Quota.vue'
import ModeTag from '@/components/console/ModeTag.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import {
  getConnectors, setCredential, deleteApiKey, deleteLinkedin, deleteCrunchbase,
  getGoogleStatus, startGoogleOauth, setGoogleDefault, revokeGoogle,
  getMementoStatus, startMementoOauth, disconnectMemento,
  getUnipileStatus, subscribeUnipile, connectUnipile, disconnectUnipile,
  getTokens, createToken, deleteToken,
} from '@/api/console'
import type { ConnectorMeta, ConnectorMode, DotTone } from '@/lib/consoleTypes'
import type { ApiToken, GoogleOauthStatus, MementoStatus, UnipileStatus } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()
const { me, reload } = useMe()

const catalog = ref<ConnectorMeta[]>([])
const google = ref<GoogleOauthStatus | null>(null)
const memento = ref<MementoStatus | null>(null)
const unipile = ref<UnipileStatus | null>(null)
const tokens = ref<ApiToken[]>([])
const error = ref<string | null>(null)

// Connecteurs à credential saisissable (modèle générique multi-champs, ADR 0011) :
// ceux qui déclarent des `credential_fields` (api_key 1 champ, basic_auth 2, silae
// 3…). Les sessions perso (cookie) et les MCP fédérés OAuth ont 0 champ → exclus
// (carte/flux dédiés). `unipile` aussi : le LinkedIn se connecte par hosted-auth
// (carte dédiée), pas en collant une clé — la clé Unipile est un secret d'org.
const keyConnectors = computed(() => catalog.value.filter(
  (c) => (c.credential_fields?.length ?? 0) > 0 && c.name !== 'unipile'))
// La carte Unipile n'apparaît que si le connecteur est exposé à l'user (activé).
const hasUnipile = computed(() => catalog.value.some((c) => c.name === 'unipile'))
// Canaux Unipile (même connecteur, même abonnement partagé) — LinkedIn + WhatsApp hébergés.
const unipileChannels = [
  { key: 'linkedin', label: 'linkedin', desc: 'search, scrape & message as you' },
  { key: 'whatsapp', label: 'whatsapp', desc: 'read & send messages as you' },
  { key: 'telegram', label: 'telegram', desc: 'read & send messages as you' },
  { key: 'instagram', label: 'instagram', desc: 'read & send DMs as you' },
] as const
// MCP fédérés (otomata#16) : oauth + non personal_session (ex. memento). Présents
// dans le catalogue seulement si l'user est entitled (grant-only, deny-by-default).
const federatedConnectors = computed(() => catalog.value.filter(
  (c) => c.secret_kind === 'oauth' && !c.personal_session))

async function load() {
  try {
    const [cat, g, m, u, t] = await Promise.all([
      getConnectors(),
      getGoogleStatus().catch(() => null),
      getMementoStatus().catch(() => null),
      getUnipileStatus().catch(() => null),
      getTokens().catch(() => ({ tokens: [] })),
    ])
    catalog.value = cat.connectors
    google.value = g
    memento.value = m
    unipile.value = u
    tokens.value = t.tokens
  } catch (e) {
    error.value = humanize(e)
  }
}
onMounted(async () => {
  // Retour du consentement OAuth memento (redirige avec ?memento=connected|error).
  const p = new URLSearchParams(window.location.search).get('memento')
  if (p === 'connected') toast('memento connecté')
  else if (p === 'error') toast('échec de la connexion memento')
  // Retour du hosted-auth Unipile (?unipile=connected|failed&channel=<canal>).
  const up = new URLSearchParams(window.location.search).get('unipile')
  const upCh = (new URLSearchParams(window.location.search).get('channel') || 'linkedin') as 'linkedin' | 'whatsapp' | 'telegram' | 'instagram'
  if (p || up) window.history.replaceState({}, '', window.location.pathname)
  if (up === 'connected') {
    // Le webhook lie l'account_id côté serveur (asynchrone) — on poll le canal visé
    // le temps qu'il arrive (quelques secondes).
    for (let i = 0; i < 5; i++) {
      unipile.value = await getUnipileStatus().catch(() => unipile.value)
      if (unipile.value?.channels?.[upCh]?.connected) break
      await new Promise((r) => setTimeout(r, 1200))
    }
    toast(unipile.value?.channels?.[upCh]?.connected ? `${upCh} connecté via unipile` : 'connexion en cours — rafraîchis dans un instant')
  } else if (up === 'failed') {
    toast(`échec de la connexion ${upCh}`)
  } else if (up === 'subscribed') {
    // Retour du checkout Stripe (abonnement option messagerie) — le webhook bascule
    // l'org en `active` (asynchrone), on poll le statut le temps qu'il arrive.
    for (let i = 0; i < 5; i++) {
      unipile.value = await getUnipileStatus().catch(() => unipile.value)
      if (unipile.value?.subscribed) break
      await new Promise((r) => setTimeout(r, 1200))
    }
    toast(unipile.value?.subscribed ? 'option messagerie activée' : 'activation en cours — rafraîchis dans un instant')
  } else if (up === 'cancel') {
    toast('activation annulée')
  }
  load()
})

async function linkMemento() {
  try { const { auth_url } = await startMementoOauth(); window.location.href = auth_url }
  catch (e) { toast(humanize(e)) }
}
async function dropMemento() {
  if (!await confirmAction({ title: 'disconnect memento', danger: true, confirmLabel: 'disconnect', message: 'disconnect your memento workspace? its tools will disappear from your session.' })) return
  try { await disconnectMemento(); toast('memento disconnected'); memento.value = await getMementoStatus() }
  catch (e) { toast(humanize(e)) }
}

async function activateUnipile() {
  try { const { checkout_url } = await subscribeUnipile(); window.location.href = checkout_url }
  catch (e) { toast(humanize(e)) }
}
async function linkUnipile(channel: string) {
  try { const { url } = await connectUnipile(channel); window.location.href = url }
  catch (e) { toast(humanize(e)) }
}
async function dropUnipile(channel: string) {
  if (!await confirmAction({ title: `disconnect ${channel} (unipile)`, danger: true, confirmLabel: 'disconnect', message: `disconnect your ${channel}? the unipile tools will stop acting as you on this channel.` })) return
  try { await disconnectUnipile(channel); toast(`${channel} disconnected`); unipile.value = await getUnipileStatus() }
  catch (e) { toast(humanize(e)) }
}

function statusMode(name: string): ConnectorMode {
  const p = me.value?.providers?.[name]
  if (!p || p.mode === 'forbidden') return 'none'
  if (p.mode === 'over_quota') return 'platform'
  return p.mode as ConnectorMode
}
function connectorTone(name: string): DotTone {
  const p = me.value?.providers?.[name]
  if (!p || p.mode === 'forbidden') return 'faint'
  if (p.mode === 'over_quota') return 'terra'
  if (p.mode === 'user') return 'olive'
  if (p.quota_daily && p.quota_used_today / p.quota_daily >= 0.75) return 'saffron'
  return 'olive'
}

async function configure(c: ConnectorMeta) {
  // GÉNÉRIQUE (ADR 0011) : le formulaire se rend depuis les champs déclarés par le
  // connecteur. 1 champ (api_key) = saisie simple ; ≥2 (basic_auth, silae) = form
  // multi-champs. Le serveur pack/chiffre selon la forme — aucune branche ici.
  const fields = c.credential_fields ?? []
  if (!fields.length) return
  const single = fields.length === 1
  const r = await promptForm({
    title: single ? `${c.label} api key` : `connect ${c.label}`,
    description: single
      ? `your ${c.label} key — stored encrypted; yours overrides the org and platform keys.`
      : `your ${c.label} credentials — stored encrypted, used to act on your behalf.`,
    fields: fields.map((f) => ({
      key: f.name,
      label: f.label.toLowerCase(),
      type: f.secret ? 'password' : undefined,
      required: true,
      placeholder: single ? `paste your ${c.label} key` : undefined,
    })),
    submitLabel: single ? 'save' : 'connect',
  })
  if (!r) return
  try {
    await setCredential(c.name, r)
    toast(`${c.label} ${single ? 'key saved' : 'connected'}`)
    await reload()
  } catch (e) { toast(humanize(e)) }
}
async function removeKey(c: ConnectorMeta) {
  if (!await confirmAction({ title: 'remove key', danger: true, confirmLabel: 'remove', message: `remove your ${c.label} key?` })) return
  try { await deleteApiKey(c.name); toast('key removed'); await reload() }
  catch (e) { toast(humanize(e)) }
}

async function dropLinkedin() {
  if (!await confirmAction({ title: 'disconnect LinkedIn', danger: true, confirmLabel: 'disconnect', message: 'disconnect your linkedin session?' })) return
  try { await deleteLinkedin(); toast('linkedin session removed'); await reload() }
  catch (e) { toast(humanize(e)) }
}
async function dropCrunchbase() {
  if (!await confirmAction({ title: 'disconnect Crunchbase', danger: true, confirmLabel: 'disconnect', message: 'disconnect your crunchbase session?' })) return
  try { await deleteCrunchbase(); toast('crunchbase session removed'); await reload() }
  catch (e) { toast(humanize(e)) }
}

async function linkGoogle() {
  try { const { auth_url } = await startGoogleOauth(); window.location.href = auth_url }
  catch (e) { toast(humanize(e)) }
}
async function makeDefault(email: string) {
  try { await setGoogleDefault(email); toast('default account updated'); google.value = await getGoogleStatus() }
  catch (e) { toast(humanize(e)) }
}
async function unlinkGoogle(email: string) {
  if (!await confirmAction({ title: 'revoke google account', danger: true, confirmLabel: 'revoke', message: `revoke ${email}? tools using it will lose access.` })) return
  try { await revokeGoogle(email); toast('grant revoked'); google.value = await getGoogleStatus() }
  catch (e) { toast(humanize(e)) }
}

async function newToken() {
  const r = await promptForm({
    title: 'new cli token', description: 'long-lived token for the oto cli and ci environments.',
    fields: [{ key: 'label', label: 'label', value: 'cli', placeholder: 'e.g. cli, ci' }],
    submitLabel: 'create',
  })
  if (!r) return
  try {
    const { token } = await createToken(r.label || undefined)
    tokens.value = (await getTokens()).tokens
    await promptForm({
      title: 'copy this token now',
      description: 'it is shown only once — store it in your secrets manager.',
      fields: [{ key: 'token', label: 'token', value: token }],
      submitLabel: 'done',
    })
  } catch (e) { toast(humanize(e)) }
}
async function revokeToken(t: ApiToken) {
  if (!await confirmAction({ title: 'revoke token', danger: true, confirmLabel: 'revoke', message: `revoke "${t.label}"?` })) return
  try { await deleteToken(t.id); toast('token revoked'); tokens.value = (await getTokens()).tokens }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard title="api keys" flush
      sub="one key per provider. yours wins over the org's; the org's wins over the platform pool.">
      <table class="tbl">
        <thead>
          <tr><th style="width: 18px"></th><th>provider</th><th>source</th><th>quota today</th><th style="width: 90px"></th></tr>
        </thead>
        <tbody>
          <tr v-for="c in keyConnectors" :key="c.name">
            <td><Dot :tone="connectorTone(c.name)" :size="7" /></td>
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ c.label }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">{{ c.help }}</div>
            </td>
            <td>
              <ModeTag :mode="statusMode(c.name)" />
              <span v-if="me?.providers?.[c.name]?.platform_key_label" class="dim" style="margin-left: 6px; font-size: 11px">{{ me?.providers?.[c.name]?.platform_key_label }}</span>
            </td>
            <td style="min-width: 130px">
              <Quota v-if="me?.providers?.[c.name]?.quota_daily"
                :used="me!.providers[c.name]!.quota_used_today"
                :total="me!.providers[c.name]!.quota_daily!" label="" />
              <span v-else class="dim">—</span>
            </td>
            <td style="text-align: right">
              <Btn v-if="me?.providers?.[c.name]?.user_key_configured" kind="danger" @click="removeKey(c)">remove</Btn>
              <Btn v-else-if="statusMode(c.name) === 'none'" kind="mini" @click="configure(c)">configure</Btn>
              <Btn v-else kind="mini" @click="configure(c)">override</Btn>
            </td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>

    <div class="grid2">
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

      <ConsoleCard title="google accounts" sub="oauth grants used by gmail, drive, sheets and calendar tools.">
        <template #actions>
          <Btn kind="mini" icon="plus" @click="linkGoogle">link account</Btn>
        </template>
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

    <ConsoleCard v-if="federatedConnectors.length" title="federated mcp"
      sub="connect another mcp to your oto — its tools mount into your session, scoped to your own account.">
      <div class="rowlist">
        <div v-for="c in federatedConnectors" :key="c.name" class="rowitem" style="gap: 12px">
          <Dot :tone="memento?.connected ? 'olive' : 'faint'" :size="8" />
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 600; font-size: 13px; display: flex; gap: 8px; align-items: center">
              {{ c.label }} <Tag tone="cobalt">mcp</Tag>
            </div>
            <div style="font-size: 11.5px; color: var(--color-mute)">
              {{ memento?.connected ? `connected ${fmtDate(memento.set_at) ?? ''} · ${c.help}` : c.help }}
            </div>
          </div>
          <Btn v-if="memento?.connected" kind="danger" @click="dropMemento">disconnect</Btn>
          <Btn v-else kind="mini" @click="linkMemento">connect</Btn>
        </div>
      </div>
    </ConsoleCard>

    <ConsoleCard v-if="hasUnipile" title="messaging (unipile)"
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

    <ConsoleCard title="cli & api tokens" flush sub="long-lived tokens for the oto cli and ci environments.">
      <template #actions>
        <Btn kind="mini" icon="plus" @click="newToken">new token</Btn>
      </template>
      <table class="tbl">
        <thead><tr><th>label</th><th>created</th><th>last used</th><th style="width: 80px"></th></tr></thead>
        <tbody>
          <tr v-for="t in tokens" :key="t.id">
            <td style="font-weight: 600; color: var(--color-ink)">{{ t.label }}</td>
            <td class="dim">{{ fmtDate(t.created_at) }}</td>
            <td class="dim">{{ fmtDate(t.last_used_at) ?? 'never' }}</td>
            <td style="text-align: right"><Btn kind="danger" @click="revokeToken(t)">revoke</Btn></td>
          </tr>
          <tr v-if="!tokens.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no tokens yet</td></tr>
        </tbody>
      </table>
    </ConsoleCard>
  </div>
</template>
