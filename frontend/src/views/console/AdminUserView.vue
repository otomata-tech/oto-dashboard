<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import CallLogCard from '@/components/console/monitoring/CallLogCard.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog, type FormDialogField } from '@/composables/useFormDialog'
import { useMe, isSuperAdmin } from '@/composables/useMe'
import {
  getAdminUser, setUserRole, getPlatformKeys, getConnectors, getMonitoringCalls,
  grantPlatformKey, revokePlatformKey,
  setAdminOrgMemberRole, setOptionComp,
} from '@/api/console'
import { setViewUser } from '@/lib/viewOrg'
import type {
  AdminGrant, AdminUserDetail, AdminUserOrg, AdminUserUnipileOrg, ConnectorMeta, PlatformKey, ProviderStatus, Role, ToolCall, UnipileStatus,
} from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const route = useRoute()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
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
const callsBusy = ref(true)

const currentRole = computed<Role>(() => detail.value?.role ?? 'member')
// Libellés des 3 paliers plateforme, pour le Tag de la fiche.
const roleLabel = computed(() =>
  currentRole.value === 'super_admin' ? 'super admin'
  : currentRole.value === 'admin' ? 'admin opérateur'
  : 'membre')
// Accès effectif par provider keyé (la question « a-t-il déjà accès ? »).
const providerRows = computed(() =>
  Object.entries(detail.value?.providers ?? {})
    .filter((e): e is [string, ProviderStatus] => !!e[1])
    .sort((a, b) => a[0].localeCompare(b[0])),
)
function access(p: ProviderStatus): { text: string; tone?: 'olive' | 'cobalt' | 'saffron' | 'terra' } {
  switch (p.mode) {
    case 'user': return { text: 'sa clé', tone: 'olive' }
    case 'group': return { text: 'via équipe', tone: 'cobalt' }
    case 'org': return { text: 'via org', tone: 'cobalt' }
    case 'platform': return { text: `plateforme · ${p.quota_used_today}/${p.quota_daily ?? '∞'}`, tone: 'saffron' }
    case 'over_quota': return { text: 'plateforme · quota épuisé', tone: 'terra' }
    default: return { text: 'aucun accès' }
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

// Pose explicitement un des 3 paliers plateforme. Confirmation requise ;
// rétrograder un super_admin (perte des droits sensibles) est marqué danger.
async function setRole(next: Role) {
  if (next === currentRole.value) return
  const labels: Record<Role, string> = {
    super_admin: 'passer super admin',
    admin: 'passer admin opérateur',
    member: 'rétrograder en membre',
  }
  const descr: Record<Role, string> = {
    super_admin: 'pleins pouvoirs : gère les rôles plateforme et les clés plateforme.',
    admin: 'palier opérationnel : voit la section plateforme · admin, mais ne peut ni changer les rôles ni gérer les clés plateforme.',
    member: 'aucun accès admin plateforme.',
  }
  const danger = currentRole.value === 'super_admin' // rétrogradation depuis super_admin
  if (!await confirmAction({
    title: 'rôle plateforme', danger, confirmLabel: labels[next],
    message: `${labels[next]} pour cet utilisateur ? ${descr[next]}`,
  })) return
  try { await setUserRole(sub.value, next); toast(`rôle → ${next}`); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}

// Dropdown des paliers admin (operator → super), fusionnant les deux anciens
// boutons. Le palier courant y est marqué (non cliquable) ; la rétrogradation
// vers member reste un bouton dédié à côté.
const roleMenu = ref<HTMLElement | null>(null)
const roleMenuOpen = ref(false)
onClickOutside(roleMenu, () => { roleMenuOpen.value = false })
const adminTiers: { role: Role; label: string; hint: string }[] = [
  { role: 'admin', label: 'admin opérateur', hint: 'supervise la plateforme' },
  { role: 'super_admin', label: 'super admin', hint: 'pleins pouvoirs' },
]
async function pickRole(next: Role) {
  roleMenuOpen.value = false
  await setRole(next)
}

const grantFor = (provider: string) => detail.value?.grants.find((g) => g.provider === provider)
const platformKeysFor = (provider: string) => keys.value.filter((k) => k.provider === provider)

function grantKey(provider: string) {
  // ADR 0044 §F : grant keyé par PROVIDER (l'instance plateforme du connecteur), plus par id.
  if (!platformKeysFor(provider).length) { toast(`aucune clé plateforme pour ${provider} — crée-la d'abord dans connecteurs (plateforme)`); return }
  const fields: FormDialogField[] = [
    { key: 'quota', label: 'quota journalier', placeholder: 'vide = défaut du provider', hint: 'appels max par jour' },
  ]
  openForm({
    title: `prêter ${provider}`, description: `prête la clé plateforme partagée ${provider} à cet utilisateur (sous quota, clé jamais révélée).`,
    fields, submitLabel: 'prêter',
    onConfirm: async (v) => {
      const quota = v.quota ? Math.max(1, Number(v.quota)) : undefined
      try { await grantPlatformKey(sub.value, provider, quota); toast(`${provider} prêté`); await loadDetail() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function revokeKey(g: AdminGrant) {
  if (!await confirmAction({ title: 'révoquer le prêt', danger: true, confirmLabel: 'Révoquer', message: `révoquer ${g.provider} ?` })) return
  try { await revokePlatformKey(sub.value, g.provider); toast('prêt révoqué'); await loadDetail() }
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
  const label = next === 'org_admin' ? 'passer org admin' : 'retirer org admin'
  if (!await confirmAction({ title: 'rôle d\'org', confirmLabel: label, message: `${label} de « ${o.name} » ?` })) return
  try { await setAdminOrgMemberRole(o.org_id, sub.value, next); toast(`${o.name} → ${next === 'org_admin' ? 'org admin' : 'membre'}`); await loadDetail() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <RouterLink class="linklike" to="/platform/users">← utilisateurs</RouterLink>
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <template v-if="detail">
      <!-- identité + rôle -->
      <ConsoleCard :title="detail.name || detail.email || detail.sub" sub="fiche utilisateur — admin plateforme.">
        <template #actions>
          <Tag v-if="currentRole === 'super_admin'" tone="terra">{{ roleLabel }}</Tag>
          <Tag v-else-if="currentRole === 'admin'" tone="ink">{{ roleLabel }}</Tag>
          <Tag v-else tone="olive">membre</Tag>
          <Btn v-if="canViewAs" kind="mini" icon="user" @click="viewAsUser">Voir en tant que</Btn>
          <!-- gestion des rôles plateforme : super_admin seul. Les deux paliers admin
               (operator → super) sont fusionnés dans un dropdown ; member reste un bouton. -->
          <template v-if="canManageRoles">
            <span ref="roleMenu" class="rolemenu">
              <Btn kind="mini" icon="chevd" @click="roleMenuOpen = !roleMenuOpen">Passer admin</Btn>
              <div v-if="roleMenuOpen" class="rolemenu__pop">
                <button
                  v-for="t in adminTiers" :key="t.role" type="button" class="rolemenu__item"
                  :disabled="currentRole === t.role" @click="pickRole(t.role)"
                >
                  <span class="rolemenu__line">
                    <span class="rolemenu__name">{{ t.label }}</span>
                    <span v-if="currentRole === t.role" class="rolemenu__cur">actuel</span>
                  </span>
                  <span class="rolemenu__hint">{{ t.hint }}</span>
                </button>
              </div>
            </span>
            <Btn v-if="currentRole !== 'member'" kind="mini" @click="setRole('member')">Rétrograder en membre</Btn>
          </template>
        </template>
        <div class="helptext">
          {{ detail.email }} · <code class="mono">{{ detail.sub }}</code>
        </div>
        <div class="helptext" style="margin-top: 6px">
          le rôle plateforme a trois paliers — <strong>super admin</strong> (pleins pouvoirs : rôles &amp; clés plateforme),
          <strong>admin opérateur</strong> (voit la section plateforme · admin, sans toucher rôles ni clés plateforme),
          et <strong>membre</strong>. il ne gate que la section admin — l'accès aux outils vient des clés, prêts et orgs ci-dessous.
        </div>
      </ConsoleCard>

      <!-- organisations dont il est membre -->
      <ConsoleCard title="organisations" sub="orgs dont cet utilisateur est membre, avec son rôle. clés partagées, readme & procédures viennent de l'org active.">
        <div v-if="detail.orgs.length" class="rowlist">
          <div v-for="o in detail.orgs" :key="o.org_id" class="rowitem" style="gap: 10px">
            <Dot :tone="o.is_active ? 'saffron' : 'faint'" :size="8" />
            <div style="flex: 1; min-width: 0">
              <span style="font-weight: 600; font-size: 13px">{{ o.name }}</span>
              <Tag :tone="o.org_role === 'org_admin' ? 'ink' : undefined" style="margin-left: 8px">{{ o.org_role === 'org_admin' ? 'org admin' : 'membre' }}</Tag>
            </div>
            <Tag v-if="o.is_active" tone="saffron">active</Tag>
            <Btn kind="mini" @click="toggleOrgRole(o)">
              {{ o.org_role === 'org_admin' ? 'Passer membre' : 'Passer admin' }}
            </Btn>
          </div>
        </div>
        <div v-else class="helptext">membre d'aucune organisation.</div>
      </ConsoleCard>

      <!-- accès effectif par provider + grant/revoke inline de la clé plateforme -->
      <ConsoleCard flush title="accès connecteurs"
        sub="accès effectif par provider keyé — prêter ou révoquer la clé plateforme partagée inline. la clé perso gagne sur l'org, l'org sur la plateforme.">
        <table class="tbl">
          <thead><tr><th style="width: 18px"></th><th>provider</th><th>accès</th><th style="width: 90px"></th></tr></thead>
          <tbody>
            <tr v-for="[name, p] in providerRows" :key="name">
              <td><Dot :tone="p.mode === 'forbidden' ? 'faint' : p.mode === 'over_quota' ? 'terra' : p.mode === 'platform' ? 'saffron' : 'olive'" :size="7" /></td>
              <td style="font-weight: 600; color: var(--color-ink)">{{ name }}</td>
              <td><Tag :tone="access(p).tone">{{ access(p).text }}</Tag></td>
              <td style="text-align: right">
                <Btn v-if="grantFor(name)" kind="danger" @click="revokeKey(grantFor(name)!)">Révoquer</Btn>
                <Btn v-else-if="platformKeysFor(name).length" kind="mini" @click="grantKey(name)">Prêter la clé</Btn>
                <span v-else class="dim" style="font-size: 11px">pas de clé plateforme</span>
              </td>
            </tr>
            <tr v-if="!providerRows.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">aucun provider keyé</td></tr>
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
                  {{ optionComped(o.key) ? 'Retirer' : 'Accorder l\'option' }}
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

      <!-- activité : journal brut réutilisé (même carte que /platform/monitoring), scopé
           à ce user via `sub` (getMonitoringCalls) -->
      <CallLogCard :calls="calls" :loaded="!callsBusy" :busy="callsBusy"
        title="activité" sub="appels d'outils récents (30 derniers jours, 100 max)."
        empty-label="aucun appel dans la fenêtre" />
    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
.rolemenu { position: relative; display: inline-flex; }
.rolemenu__pop {
  position: absolute; right: 0; top: calc(100% + 6px); width: 200px; background: var(--color-surface);
  border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  box-shadow: var(--shadow-card); overflow: hidden; z-index: 30;
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
