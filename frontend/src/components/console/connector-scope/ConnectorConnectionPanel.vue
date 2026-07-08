<script setup lang="ts">
// Panneau CONNEXION (scope USER) du drawer unifié — couche d'authentification (ADR 0024).
// Extrait verbatim de l'ex-`ConnectorDrawer` : verdict « état pour toi » (ADR 0044) +
// bandeau côté-org (org_admin) + widget dérivé de la méthode d'auth (clé/oauth/session/
// hosted/fédéré) + cascade de résolution. Réutilise les MÊMES widgets (source unique,
// zéro réécriture de flux). Les actions clé keyée viennent du levier de l'adaptateur.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Btn from '@/components/console/Btn.vue'
import Quota from '@/components/console/Quota.vue'
import Dot from '@/components/console/Dot.vue'
import ConnectorOAuthAccounts from '@/components/console/ConnectorOAuthAccounts.vue'
import ConnectorFederatedWidget from '@/components/console/ConnectorFederatedWidget.vue'
import ConnectorSessionWidget from '@/components/console/ConnectorSessionWidget.vue'
import ConnectorHostedWidget from '@/components/console/ConnectorHostedWidget.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import { getOrgConnectorActivation } from '@/api/console'
import type { ConnectionLever } from './adapter'
import type { ConnectorMode, DotTone } from '@/lib/consoleTypes'
import type { MyConnector, OrgConnectorActivation, VerifyResult } from '@/types/api'

const props = defineProps<{ connector: MyConnector; lever: ConnectionLever<MyConnector> }>()
const { me } = useMe()
const { toast } = useToast()
const c = computed(() => props.connector)

// Bandeau côté-org (ADR 0044 B4) — résumé lecture seule pour un org_admin.
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin')
const orgAct = ref<OrgConnectorActivation | null>(null)
onMounted(async () => {
  if (!isOrgAdmin.value || me.value?.active_org == null) return
  try {
    const list = (await getOrgConnectorActivation(me.value.active_org)).connectors
    orgAct.value = list.find((a) => a.connector === c.value.name) ?? null
  } catch { /* le bloc org ne s'affiche simplement pas */ }
})

type Conn = 'key' | 'session' | 'google' | 'memento' | 'unipile' | 'none'
const connKind = computed<Conn>(() => {
  switch (c.value.auth.method) {
    case 'hosted': return 'unipile'
    case 'cookie': return 'session'
    case 'oauth': return c.value.auth.cardinality === 'multi_account' ? 'google' : 'memento'
    case 'secret': return 'key'
    default: return 'none'
  }
})
const isOpenData = computed(() => c.value.auth.method === 'none')
const isRemote = computed(() => c.value.auth.method === 'remote')
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

const status = computed(() => me.value?.providers?.[c.value.name])
const statusMode = computed<ConnectorMode>(() => {
  const p = status.value
  if (!p || p.mode === 'forbidden') return 'none'
  if (p.mode === 'over_quota') return 'platform'
  return p.mode as ConnectorMode
})
const keyConfigured = computed(() => !!status.value?.user_key_configured)
const needsKey = computed(() => connKind.value === 'key')
const canTest = computed(() => c.value.verifiable && statusMode.value !== 'none')
const testing = ref(false)
const testRes = ref<VerifyResult | null>(null)
async function testConnection() {
  if (!props.lever.verify) return
  testing.value = true; testRes.value = null
  try { testRes.value = await props.lever.verify(c.value) }
  catch (e) { toast(humanize(e)) } finally { testing.value = false }
}
function nodeCls(mode: ConnectorMode): string { return 'node' + (statusMode.value === mode ? ' win' : '') }
const KEY_STATUS: Record<ConnectorMode, string> = {
  none: 'no key resolves yet — connect one below.',
  user: 'resolved by your own key, set in this org.',
  group: "resolved by your team's shared key.",
  org: "resolved by your org's shared key — you don't need your own.",
  platform: 'resolved by the oto platform key.',
}
const keyStatus = computed(() => KEY_STATUS[statusMode.value])
const docRefCount = computed(() => c.value.doctrine_ref_count ?? 0)

// Verdict « état pour toi » (ADR 0044) — ET-logique des 3 couches.
const availOk = computed(() => status.value?.mode !== 'forbidden')
const connOk = computed(() => isOpenData.value || statusMode.value !== 'none')
const connSource = computed(() => {
  if (isOpenData.value) return 'open data'
  const m = statusMode.value
  return m === 'user' ? 'ta clé' : m === 'group' ? "clé d'équipe" : m === 'org' ? "clé d'org" : m === 'platform' ? 'clé oto' : ''
})
const optionRequired = computed(() => c.value.paid_option ?? null)
const optionOk = computed(() => c.value.option_ok !== false)
const availTone = computed<DotTone>(() => (availOk.value ? 'olive' : 'saffron'))
const connTone = computed<DotTone>(() => (isOpenData.value ? 'faint' : connOk.value ? 'olive' : 'saffron'))
const optTone = computed<DotTone>(() => (!optionRequired.value ? 'faint' : optionOk.value ? 'olive' : 'saffron'))
const verdict = computed<{ tone: DotTone; text: string }>(() => {
  if (!availOk.value) return { tone: 'saffron', text: 'Réservé à certaines équipes/personnes de ton org — demande l’accès à un admin.' }
  if (!optionOk.value) return { tone: 'saffron', text: `Bloqué : l’option « ${optionRequired.value} » n’est pas accordée pour toi.` }
  if (!connOk.value) return { tone: 'saffron', text: 'Exposé mais pas connecté — branche une clé ci-dessous.' }
  if (status.value?.mode === 'over_quota') return { tone: 'saffron', text: 'Quota de la clé plateforme atteint pour aujourd’hui.' }
  return { tone: 'olive', text: 'Prêt à l’emploi.' }
})
</script>

<template>
  <div>
    <!-- état pour toi -->
    <div class="dr-block">
      <div class="eyebrow" style="margin-bottom: 9px">état pour toi</div>
      <div class="statrow">
        <span class="spill"><Dot :tone="availTone" />disponibilité</span>
        <span class="spill"><Dot :tone="connTone" />connexion<span v-if="connSource" class="dim"> · {{ connSource }}</span></span>
        <span class="spill"><Dot :tone="optTone" />option<span v-if="!optionRequired" class="dim"> · n/a</span></span>
      </div>
      <p class="verdict" :class="verdict.tone">{{ verdict.text }}</p>
    </div>

    <!-- côté org (org_admin) -->
    <div v-if="isOrgAdmin && orgAct" class="dr-block">
      <div class="eyebrow" style="margin-bottom: 9px">côté org · {{ me?.active_org_name || 'ton org' }}</div>
      <div class="statrow">
        <span class="spill"><Dot :tone="orgAct.effective ? 'olive' : 'faint'" />{{ orgAct.effective ? 'disponible pour tes membres' : 'coupé pour tes membres' }}</span>
        <span v-if="orgAct.paid_option" class="spill"><Dot :tone="orgAct.subscribed ? 'olive' : 'saffron'" />option {{ orgAct.paid_option }}</span>
      </div>
      <p class="helptext" style="margin: 9px 0 0"><RouterLink to="/org/connectors" class="org-link">gérer la disponibilité, l'accès et la clé d'org →</RouterLink></p>
    </div>

    <!-- connexion -->
    <div class="dr-block">
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
        <div style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap">
          <template v-if="keyConfigured">
            <Btn kind="mini" @click="lever.configureKey(c)">Override key</Btn>
            <Btn kind="danger" @click="lever.removeKey(c)">Remove key</Btn>
          </template>
          <Btn v-else kind="mini" @click="lever.configureKey(c)">Connect {{ c.label }}</Btn>
          <Btn v-if="canTest && lever.verify" kind="mini" :disabled="testing" @click="testConnection">{{ testing ? 'Test…' : 'Test connection' }}</Btn>
        </div>
        <p v-if="testRes" class="helptext" style="margin: 10px 0 0" :style="{ color: testRes.ok ? 'var(--color-olive)' : 'var(--color-terra-ink)' }">
          {{ testRes.ok ? '✓ connexion OK' : `✗ ${testRes.error}` }}
        </p>
      </div>

      <ConnectorOAuthAccounts v-else-if="connKind === 'google'" />
      <ConnectorFederatedWidget v-else-if="connKind === 'memento'" :connector="c" />
      <ConnectorSessionWidget v-else-if="connKind === 'session'" :connector="c" />
      <ConnectorHostedWidget v-else-if="connKind === 'unipile'" />

      <div v-else-if="isRemote" class="dr-box dashed">
        <div style="display: flex; align-items: center; gap: 9px"><Dot tone="cobalt" /><span style="font-size: 12.5px; font-weight: 600">org bridge — provisioned by your org</span></div>
        <p class="helptext" style="margin: 8px 0 0">your org admin places the machine credential; members just use it, read-only.</p>
      </div>
      <div v-else-if="isOpenData" class="dr-box dashed">
        <div style="display: flex; align-items: center; gap: 9px"><Dot tone="cobalt" /><span style="font-size: 12.5px; font-weight: 600">open data — no credential needed</span></div>
        <p class="helptext" style="margin: 8px 0 0">tools work out of the box. flip exposure to <strong>live</strong> and your agents can call them immediately.</p>
      </div>

      <p v-if="docRefCount > 0" class="helptext" style="margin-top: 14px; color: var(--color-mute)">↳ referenced by <strong style="color: var(--color-ink-soft)">{{ docRefCount }}</strong> procedure{{ docRefCount > 1 ? 's' : '' }} — connect it to run them.</p>
    </div>
  </div>
</template>

<style scoped>
.dr-block { padding: 18px 20px; border-bottom: 1px solid var(--color-hair-soft); }
.dr-box { border: 1px solid var(--color-hair); border-radius: 10px; padding: 14px; background: var(--color-surface); }
.dr-box.dashed { border-style: dashed; border-color: var(--color-hair-classic); }
.cascade { display: flex; align-items: center; gap: 0; flex-wrap: wrap; }
.cascade .node { font-family: var(--font-mono); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--color-hair); color: var(--color-faint); background: var(--color-surface); }
.cascade .node.win { border-color: var(--color-olive); color: var(--color-olive-ink); background: var(--color-olive-soft); font-weight: 700; }
.cascade .arr { color: var(--color-faint); font-size: 11px; padding: 0 5px; }
.dim { color: var(--color-faint); font-weight: 500; }
.statrow { display: flex; flex-wrap: wrap; gap: 14px; }
.spill { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--color-ink); }
.verdict { margin: 11px 0 0; font-size: 13px; font-weight: 600; }
.verdict.olive { color: var(--color-olive-ink); }
.verdict.saffron { color: var(--color-saffron-ink); }
.org-link { color: var(--color-cobalt-ink); font-weight: 600; text-decoration: none; }
.org-link:hover { text-decoration: underline; }
</style>
