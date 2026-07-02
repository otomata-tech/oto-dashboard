<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog, type FormDialogField } from '@/composables/useFormDialog'
import { useMe, isSuperAdmin } from '@/composables/useMe'
import {
  getAdminUser, setUserRole, getPlatformKeys, getConnectors, getMonitoringCalls,
  grantPlatformKey, revokePlatformKey, grantNamespace, revokeNamespaceGrant, resendAlphaInvite,
  setAdminOrgMemberRole, setOptionComp,
} from '@/api/console'
import { setViewUser } from '@/lib/viewOrg'
import type {
  AdminGrant, AdminUserDetail, AdminUserOrg, AdminUserUnipileOrg, ConnectorMeta, NamespaceGrant, PlatformKey, ProviderStatus, Role, ToolCall, UnipileStatus,
} from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const route = useRoute()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
// Dialog séparé pour la révélation du lien d'invitation (ouvert depuis resendInvite).
const { formDialog: revealDialog, formDialogOpen: revealOpen, openForm: openReveal } = useFormDialog()
const { me } = useMe()

// La gestion des rôles plateforme est réservée au super_admin (le backend rejette
// de toute façon ; l'UI ne propose pas l'action à un simple opérateur).
const canManageRoles = computed(() => isSuperAdmin(me.value))

// « Voir en tant que » (ADR 0023, lecture seule) : pose la consultation user + recharge
// sur le console — tout le dashboard rend alors la vue de ce user. Pas sur soi-même.
const canViewAs = computed(() => !!detail.value && detail.value.sub !== me.value?.sub)
function viewAsUser() {
  if (!detail.value) return
  setViewUser({ sub: detail.value.sub, name: detail.value.name || detail.value.email || detail.value.sub })
  window.location.href = '/console'
}

const sub = computed(() => String(route.params.sub))
const detail = ref<AdminUserDetail | null>(null)
const keys = ref<PlatformKey[]>([])
const catalog = ref<ConnectorMeta[]>([])
const calls = ref<ToolCall[]>([])
const error = ref<string | null>(null)
const callsBusy = ref(false)

const currentRole = computed<Role>(() => detail.value?.role ?? 'member')
// Libellés des 3 paliers plateforme, pour le Tag de la fiche.
const roleLabel = computed(() =>
  currentRole.value === 'super_admin' ? 'super admin'
  : currentRole.value === 'admin' ? 'operator admin'
  : 'member')
const accessStatus = computed(() => detail.value?.access_status ?? null)
// On propose le renvoi tant que l'accès n'est pas actif (waitlist/pending ou bloqué),
// ou s'il reste une invitation en attente pour son email.
const canResend = computed(() =>
  !!detail.value?.email && (accessStatus.value !== 'active' || !!detail.value?.pending_invite))
const callsErrCount = computed(() => calls.value.filter((c) => !c.ok).length)
// Accès effectif par provider keyé (la question « a-t-il déjà accès ? »).
const providerRows = computed(() =>
  Object.entries(detail.value?.providers ?? {})
    .filter((e): e is [string, ProviderStatus] => !!e[1])
    .sort((a, b) => a[0].localeCompare(b[0])),
)
const nsOptions = computed(() =>
  [...new Set(catalog.value.filter((c) => c.availability === 'platform_granted').flatMap((c) => c.namespaces))],
)

function access(p: ProviderStatus): { text: string; tone?: 'olive' | 'cobalt' | 'saffron' | 'terra' } {
  switch (p.mode) {
    case 'user': return { text: 'own key', tone: 'olive' }
    case 'group': return { text: 'via team', tone: 'cobalt' }
    case 'org': return { text: 'via org', tone: 'cobalt' }
    case 'platform': return { text: `platform · ${p.quota_used_today}/${p.quota_daily ?? '∞'}`, tone: 'saffron' }
    case 'over_quota': return { text: 'platform · quota exhausted', tone: 'terra' }
    default: return { text: 'no access' }
  }
}

async function loadDetail() {
  try { detail.value = await getAdminUser(sub.value) }
  catch (e) { error.value = humanize(e) }
}
async function loadActivity() {
  callsBusy.value = true
  try { calls.value = (await getMonitoringCalls({ sub: sub.value, limit: 100, days: 30 })).calls }
  catch { /* activité best-effort, ne bloque pas la fiche */ }
  finally { callsBusy.value = false }
}
async function loadStatic() {
  keys.value = (await getPlatformKeys().catch(() => ({ platform_keys: [] }))).platform_keys
  catalog.value = (await getConnectors().catch(() => ({ connectors: [] }))).connectors
}
function loadAll() { error.value = null; loadDetail(); loadActivity(); loadStatic() }
onMounted(loadAll)
watch(sub, loadAll)

const resending = ref(false)
async function resendInvite() {
  if (!detail.value?.email) return
  resending.value = true
  try {
    const res = await resendAlphaInvite(detail.value.email)
    if (res.emailed) {
      toast(`invitation re-sent to ${res.email}`)
    } else {
      openReveal({
        title: 'share this invitation link',
        description: 'email delivery is off on this server — copy and send it yourself.',
        fields: [{ key: 'url', label: 'invitation link', initial: res.invite_url }],
        submitLabel: 'done',
        onConfirm: async () => {},
      })
    }
    await loadDetail()
  } catch (e) { toast(humanize(e)) } finally { resending.value = false }
}

// Pose explicitement un des 3 paliers plateforme. Confirmation requise ;
// rétrograder un super_admin (perte des droits sensibles) est marqué danger.
async function setRole(next: Role) {
  if (next === currentRole.value) return
  const labels: Record<Role, string> = {
    super_admin: 'make super admin',
    admin: 'make operator admin',
    member: 'demote to member',
  }
  const descr: Record<Role, string> = {
    super_admin: 'full power: manages platform roles and platform keys.',
    admin: 'operational tier: sees the platform · admin section, but cannot change platform roles or manage platform keys.',
    member: 'no platform admin access.',
  }
  const danger = currentRole.value === 'super_admin' // rétrogradation depuis super_admin
  if (!await confirmAction({
    title: 'platform role', danger, confirmLabel: labels[next],
    message: `${labels[next]} for this user? ${descr[next]}`,
  })) return
  try { await setUserRole(sub.value, next); toast(`role → ${next}`); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}

// Dropdown des paliers admin (operator → super), fusionnant les deux anciens
// boutons. Le palier courant y est marqué (non cliquable) ; la rétrogradation
// vers member reste un bouton dédié à côté.
const roleMenu = ref<HTMLElement | null>(null)
const roleMenuOpen = ref(false)
onClickOutside(roleMenu, () => { roleMenuOpen.value = false })
const adminTiers: { role: Role; label: string; hint: string }[] = [
  { role: 'admin', label: 'operator admin', hint: 'supervises the platform' },
  { role: 'super_admin', label: 'super admin', hint: 'full power' },
]
async function pickRole(next: Role) {
  roleMenuOpen.value = false
  await setRole(next)
}

const grantFor = (provider: string) => detail.value?.grants.find((g) => g.provider === provider)
const platformKeysFor = (provider: string) => keys.value.filter((k) => k.provider === provider)

function grantKey(provider: string) {
  const pool = platformKeysFor(provider)
  if (!pool.length) { toast(`no platform key for ${provider} — create one in platform keys first`); return }
  const fields: FormDialogField[] = []
  if (pool.length > 1) {
    fields.push({ key: 'key', label: 'platform key', type: 'select', required: true,
      options: pool.map((k) => ({ value: String(k.id), label: `${k.provider}/${k.label}` })) })
  }
  fields.push({ key: 'quota', label: 'daily quota', placeholder: 'blank = provider default', hint: 'max calls per day' })
  openForm({
    title: `grant ${provider}`, description: `lend the shared ${provider} platform key to this user (quota-metered, key never revealed).`,
    fields, submitLabel: 'grant',
    onConfirm: async (v) => {
      const keyId = pool.length > 1 ? Number(v.key) : pool[0]!.id
      const quota = v.quota ? Math.max(1, Number(v.quota)) : undefined
      try { await grantPlatformKey(sub.value, keyId, quota); toast(`${provider} granted`); await loadDetail() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function revokeKey(g: AdminGrant) {
  if (!await confirmAction({ title: 'revoke grant', danger: true, confirmLabel: 'revoke', message: `revoke ${g.provider}/${g.label}?` })) return
  try { await revokePlatformKey(sub.value, g.platform_key_id); toast('grant revoked'); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}
function grantNs() {
  openForm({
    title: 'grant a namespace', description: 'unlock a controlled (deny-by-default) namespace for this user.',
    fields: nsOptions.value.length
      ? [{ key: 'ns', label: 'namespace', type: 'select', required: true, placeholder: 'choose a namespace',
          options: nsOptions.value.map((n) => ({ value: n, label: n })) }]
      : [{ key: 'ns', label: 'namespace', required: true, hint: 'no controlled namespace in catalog — type one' }],
    submitLabel: 'grant',
    onConfirm: async (v) => {
      try { await grantNamespace(sub.value, v.ns ?? ''); toast(`granted ${v.ns}`); await loadDetail() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function revokeNs(g: NamespaceGrant) {
  if (!await confirmAction({ title: 'revoke namespace grant', danger: true, confirmLabel: 'revoke', message: `revoke ${g.namespace}?` })) return
  try { await revokeNamespaceGrant(sub.value, g.namespace); toast('grant revoked'); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}

// Options de connecteur (couche 3, oto-backend/docs/connector-model.md) : accorder
// l'option à CET user (comp admin user-level). Plus de paiement.
const PAID_OPTIONS = [{ key: 'unipile', label: 'messagerie hébergée (unipile)' }]
const optionComped = (opt: string) => detail.value?.option_comps?.includes(opt) ?? false
// Statut EFFECTIF de l'option (pas seulement le comp user) : pour unipile, refléter
// le comp d'ORG / le BYO — sinon « non offerte » ment quand l'utilisateur est en
// réalité débloqué via son org (le bouton, lui, reste le levier user-level :
// offrir/retirer le comp À CET utilisateur, indépendant de l'org).
function optionStatus(opt: string): { text: string; tone?: 'olive' | 'saffron' } {
  if (optionComped(opt)) return { text: 'offerte (comp user)', tone: 'olive' }
  if (opt === 'unipile') {
    // EFFECTIF toutes orgs confondues : débloqué via un comp/BYO de l'une de ses orgs.
    const orgs = detail.value?.unipile_orgs ?? []
    if (orgs.some((u) => u.option_source?.org_comp)) return { text: 'offerte via org (comp)', tone: 'olive' }
    if (orgs.some((u) => u.byo)) return { text: 'clé BYO (instance propre)', tone: 'olive' }
  }
  return { text: 'non offerte' }
}
async function toggleOption(opt: string) {
  const on = !optionComped(opt)
  try {
    await setOptionComp('user', sub.value, opt, on)
    toast(on ? `${opt} offert (comp)` : `${opt} retiré`)
    await loadDetail()
  } catch (e) { toast(humanize(e)) }
}

// Messagerie Unipile (lecture seule) — mêmes canaux que ConnectorHostedWidget.
const UNIPILE_CHANNELS: { key: keyof UnipileStatus['channels']; label: string }[] = [
  { key: 'linkedin', label: 'linkedin' },
  { key: 'whatsapp', label: 'whatsapp' },
  { key: 'telegram', label: 'telegram' },
  { key: 'instagram', label: 'instagram' },
  { key: 'messenger', label: 'messenger' },
  { key: 'twitter', label: 'x / twitter' },
]
const unipileModeLabel = (m?: string) =>
  m === 'user' ? 'perso' : m === 'org' ? 'org' : m === 'group' ? 'équipe'
    : m === 'platform' ? 'plateforme oto' : m
function unipileSourceLabel(u: AdminUserUnipileOrg): string {
  if (u.byo) return "clé BYO — instance Unipile propre"
  const s = u.option_source
  if (s?.user_comp) return 'option offerte (comp user)'
  if (s?.org_comp) return 'option offerte (comp org)'
  return u.subscribed ? 'option active' : 'aucune option active'
}

// Bascule le rôle d'org du user (member ↔ org_admin) depuis la fiche admin.
async function toggleOrgRole(o: AdminUserOrg) {
  const next = o.org_role === 'org_admin' ? 'org_member' : 'org_admin'
  const label = next === 'org_admin' ? 'make org admin' : 'remove org admin'
  if (!await confirmAction({ title: 'org role', confirmLabel: label, message: `${label} of "${o.name}"?` })) return
  try { await setAdminOrgMemberRole(o.org_id, sub.value, next); toast(`${o.name} → ${next === 'org_admin' ? 'org admin' : 'member'}`); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <RouterLink class="linklike" to="/platform/users">← users</RouterLink>
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <template v-if="detail">
      <!-- identité + rôle -->
      <ConsoleCard :title="detail.name || detail.email || detail.sub" sub="platform-admin user fiche.">
        <template #actions>
          <Tag v-if="accessStatus === 'active'" tone="olive">active</Tag>
          <Tag v-else-if="accessStatus === 'blocked'" tone="terra">blocked</Tag>
          <Tag v-else-if="accessStatus" tone="saffron">{{ accessStatus }}</Tag>
          <Tag v-if="currentRole === 'super_admin'" tone="terra">{{ roleLabel }}</Tag>
          <Tag v-else-if="currentRole === 'admin'" tone="ink">{{ roleLabel }}</Tag>
          <Tag v-else tone="olive">member</Tag>
          <Btn v-if="canResend" kind="mini" :disabled="resending" @click="resendInvite">
            {{ resending ? 'sending…' : 'resend invite' }}
          </Btn>
          <Btn v-if="canViewAs" kind="mini" icon="user" @click="viewAsUser">voir en tant que</Btn>
          <!-- gestion des rôles plateforme : super_admin seul. Les deux paliers admin
               (operator → super) sont fusionnés dans un dropdown ; member reste un bouton. -->
          <template v-if="canManageRoles">
            <span ref="roleMenu" class="rolemenu">
              <Btn kind="mini" icon="chevd" @click="roleMenuOpen = !roleMenuOpen">make admin</Btn>
              <div v-if="roleMenuOpen" class="rolemenu__pop">
                <button
                  v-for="t in adminTiers" :key="t.role" type="button" class="rolemenu__item"
                  :disabled="currentRole === t.role" @click="pickRole(t.role)"
                >
                  <span class="rolemenu__line">
                    <span class="rolemenu__name">{{ t.label }}</span>
                    <span v-if="currentRole === t.role" class="rolemenu__cur">current</span>
                  </span>
                  <span class="rolemenu__hint">{{ t.hint }}</span>
                </button>
              </div>
            </span>
            <Btn v-if="currentRole !== 'member'" kind="mini" @click="setRole('member')">demote to member</Btn>
          </template>
        </template>
        <div class="helptext">
          {{ detail.email }} · <code class="mono">{{ detail.sub }}</code>
        </div>
        <div v-if="detail.pending_invite" class="helptext" style="margin-top: 6px">
          pending alpha invitation · expires {{ fmtDate(detail.pending_invite.expires_at) }} — resend issues a fresh link.
        </div>
        <div class="helptext" style="margin-top: 6px">
          platform role has three tiers — <strong>super admin</strong> (full power: manages platform roles &amp; platform keys),
          <strong>operator admin</strong> (sees the platform · admin section, but can't change roles or platform keys),
          and <strong>member</strong>. it gates only the admin section — tool access comes from keys, grants and org membership below.
        </div>
      </ConsoleCard>

      <!-- organisations dont il est membre -->
      <ConsoleCard title="organizations" sub="orgs this user belongs to, with their role. shared keys, readme & procedures come from the active org.">
        <div v-if="detail.orgs.length" class="rowlist">
          <div v-for="o in detail.orgs" :key="o.org_id" class="rowitem" style="gap: 10px">
            <Dot :tone="o.is_active ? 'saffron' : 'faint'" :size="8" />
            <div style="flex: 1; min-width: 0">
              <span style="font-weight: 600; font-size: 13px">{{ o.name }}</span>
              <Tag :tone="o.org_role === 'org_admin' ? 'ink' : undefined" style="margin-left: 8px">{{ o.org_role === 'org_admin' ? 'org admin' : 'member' }}</Tag>
            </div>
            <Tag v-if="o.is_active" tone="saffron">active</Tag>
            <Btn kind="mini" @click="toggleOrgRole(o)">
              {{ o.org_role === 'org_admin' ? 'make member' : 'make admin' }}
            </Btn>
          </div>
        </div>
        <div v-else class="helptext">not a member of any organization.</div>
      </ConsoleCard>

      <!-- accès effectif par provider + grant/revoke inline de la clé plateforme -->
      <ConsoleCard flush title="connector access"
        sub="effective access per keyed provider — grant or revoke the shared platform key inline. own key wins over org, org over platform.">
        <table class="tbl">
          <thead><tr><th style="width: 18px"></th><th>provider</th><th>access</th><th style="width: 90px"></th></tr></thead>
          <tbody>
            <tr v-for="[name, p] in providerRows" :key="name">
              <td><Dot :tone="p.mode === 'forbidden' ? 'faint' : p.mode === 'over_quota' ? 'terra' : p.mode === 'platform' ? 'saffron' : 'olive'" :size="7" /></td>
              <td style="font-weight: 600; color: var(--color-ink)">{{ name }}</td>
              <td><Tag :tone="access(p).tone">{{ access(p).text }}</Tag></td>
              <td style="text-align: right">
                <Btn v-if="grantFor(name)" kind="danger" @click="revokeKey(grantFor(name)!)">revoke</Btn>
                <Btn v-else-if="platformKeysFor(name).length" kind="mini" @click="grantKey(name)">grant key</Btn>
                <span v-else class="dim" style="font-size: 11px">no platform key</span>
              </td>
            </tr>
            <tr v-if="!providerRows.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no keyed providers</td></tr>
          </tbody>
        </table>
      </ConsoleCard>

      <!-- options de connecteur : comp admin au niveau user (couche 3) -->
      <ConsoleCard flush title="options de connecteur"
        sub="accorder une option de connecteur à cet utilisateur (comp admin). débloque l'option même sans org.">
        <table class="tbl">
          <thead><tr><th>option</th><th>statut</th><th style="width: 130px"></th></tr></thead>
          <tbody>
            <tr v-for="o in PAID_OPTIONS" :key="o.key">
              <td style="font-weight: 600; color: var(--color-ink)">{{ o.label }}</td>
              <td><Tag :tone="optionStatus(o.key).tone">{{ optionStatus(o.key).text }}</Tag></td>
              <td style="text-align: right">
                <Btn :kind="optionComped(o.key) ? 'danger' : 'mini'" @click="toggleOption(o.key)">
                  {{ optionComped(o.key) ? 'retirer' : 'accorder l\'option' }}
                </Btn>
              </td>
            </tr>
          </tbody>
        </table>
      </ConsoleCard>

      <!-- messagerie Unipile (lecture seule) — un bloc PAR ORG (l'option est per-org) -->
      <ConsoleCard title="messagerie (Unipile)"
        sub="canaux hébergés + option, PAR org dont l'utilisateur est membre (l'option est par org). lecture seule.">
        <template v-if="detail.unipile_orgs && detail.unipile_orgs.length">
          <div v-for="(uo, i) in detail.unipile_orgs" :key="uo.org_id ?? `orphan-${i}`"
            class="rowlist"
            :style="i ? 'border-top: 1px solid var(--color-hair-soft); margin-top: 8px; padding-top: 4px' : ''">
            <div class="rowitem" style="gap: 8px; flex-wrap: wrap; border-bottom: 0">
              <span style="font-weight: 700; font-size: 13px; color: var(--color-ink)">{{ uo.org_name || '—' }}</span>
              <Tag v-if="uo.is_active" tone="saffron">maison</Tag>
              <Tag v-if="uo.subscribed !== null" :tone="uo.subscribed ? 'olive' : undefined">
                {{ uo.subscribed ? 'option active' : 'option inactive' }}
              </Tag>
              <Tag v-if="uo.mode && uo.mode !== 'forbidden'" :tone="uo.mode === 'platform' ? 'saffron' : 'cobalt'">
                clé : {{ unipileModeLabel(uo.mode) }}
              </Tag>
              <span v-if="uo.org_id !== null" class="dim" style="font-size: 12px">{{ unipileSourceLabel(uo) }}</span>
            </div>
            <div v-for="c in UNIPILE_CHANNELS" :key="c.key" class="rowitem" style="gap: 10px">
              <Dot :tone="uo.channels[c.key]?.connected ? 'olive' : 'faint'" :size="8" />
              <span style="flex: 1; min-width: 0; font-weight: 600; font-size: 13px">{{ c.label }}</span>
              <template v-if="uo.channels[c.key]?.connected">
                <Tag tone="olive">connecté</Tag>
                <span class="dim" style="font-size: 11px">{{ fmtDate(uo.channels[c.key].connected_at) }}</span>
              </template>
              <span v-else class="dim" style="font-size: 11px">non connecté</span>
            </div>
          </div>
        </template>
        <div v-else class="helptext">membre d'aucune org — pas de messagerie.</div>
      </ConsoleCard>

      <!-- namespaces débloqués -->
      <ConsoleCard title="namespace grants" sub="controlled (deny-by-default) namespaces this user can see & call.">
        <template #actions><Btn kind="mini" @click="grantNs">grant a namespace</Btn></template>
        <div v-if="detail.namespace_grants.length" class="rowlist">
          <div v-for="g in detail.namespace_grants" :key="g.namespace" class="rowitem" style="gap: 10px">
            <Tag tone="cobalt">{{ g.namespace }}</Tag>
            <span class="dim" style="flex: 1; font-size: 11.5px">granted {{ fmtDate(g.granted_at) }}</span>
            <Btn kind="danger" @click="revokeNs(g)">revoke</Btn>
          </div>
        </div>
        <div v-else class="helptext">no namespace grants — sensitive connectors stay hidden for this user.</div>
      </ConsoleCard>

      <!-- activité -->
      <ConsoleCard flush title="activity" sub="recent tool calls (last 30 days, up to 100).">
        <template #actions>
          <span class="dim" style="font-size: 11.5px">{{ calls.length }} calls · <ErrLabel v-if="callsErrCount">{{ callsErrCount }} err</ErrLabel><span v-else class="dim">0 err</span></span>
        </template>
        <table class="tbl">
          <thead><tr><th style="width: 18px"></th><th>tool</th><th>when</th><th class="num">duration</th><th>status</th></tr></thead>
          <tbody>
            <tr v-for="c in calls" :key="c.id">
              <td><Dot :tone="c.ok ? 'olive' : 'terra'" :size="7" /></td>
              <td><code class="mono">{{ c.tool_name }}</code></td>
              <td class="dim">{{ fmtDate(c.called_at) }}</td>
              <td class="num dim">{{ c.duration_ms != null ? c.duration_ms + ' ms' : '—' }}</td>
              <td><ErrLabel v-if="!c.ok">{{ c.error || 'error' }}</ErrLabel><span v-else class="dim">ok</span></td>
            </tr>
            <tr v-if="callsBusy"><td colspan="5" class="dim" style="text-align: center; padding: 16px">loading…</td></tr>
            <tr v-else-if="!calls.length"><td colspan="5" class="dim" style="text-align: center; padding: 16px">no calls in the window</td></tr>
          </tbody>
        </table>
      </ConsoleCard>
    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
    <FormDialog v-if="revealDialog" v-model:open="revealOpen"
      :title="revealDialog.title" :description="revealDialog.description"
      :fields="revealDialog.fields" :submit-label="revealDialog.submitLabel" :on-confirm="revealDialog.onConfirm" />
  </div>
</template>

<style scoped>
.rolemenu { position: relative; display: inline-flex; }
.rolemenu__pop {
  position: absolute; right: 0; top: calc(100% + 6px); width: 200px; background: var(--color-surface);
  border: 1px solid var(--color-hair); border-radius: 11px;
  box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.22); overflow: hidden; z-index: 30;
}
.rolemenu__item {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 8px 12px;
  border: 0; border-bottom: 1px solid var(--color-hair-soft); background: transparent; cursor: pointer;
}
.rolemenu__item:last-child { border-bottom: 0; }
.rolemenu__item:hover:not(:disabled) { background: var(--color-paper-2); }
.rolemenu__item:disabled { cursor: default; opacity: 0.55; }
.rolemenu__line { display: flex; align-items: center; gap: 7px; }
.rolemenu__name { font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--color-ink); }
.rolemenu__cur {
  font-family: var(--font-mono); font-size: 8px; font-weight: 600; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--color-mute);
}
.rolemenu__hint { font-size: 11px; color: var(--color-mute); }
</style>
