<script setup lang="ts">
// Fiche d'une organisation (plateforme) — page DÉDIÉE navigable `/platform/orgs/:id`
// (comme la fiche user `/platform/users/:sub`), montée par ConsoleLayout via
// `meta.detail === 'admin-org'`. Gouvernance admin (membres / clés / entitlements /
// options / clés plateforme) + entrée en CONSULTATION lecture (ADR 0023).
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import {
  getAdminOrg, archiveAdminOrg, addAdminOrgMember, setAdminOrgMemberRole,
  removeAdminOrgMember, putAdminOrgSecret, deleteAdminOrgSecret,
  grantOrgEntitlement, revokeOrgEntitlement, getConnectors, setOptionComp,
  getPlatformKeys, grantOrgPlatformKey, revokeOrgPlatformKey,
} from '@/api/console'
import type { AdminGrant, ConnectorMeta, OrgDetail, OrgMember, OrgSecret, OrgEntitlement, OrgRole, PlatformKey } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

const orgId = computed(() => Number(route.params.id))
const detail = ref<OrgDetail | null>(null)
const catalog = ref<ConnectorMeta[]>([])
const pkeys = ref<PlatformKey[]>([])
const error = ref<string | null>(null)
const loading = ref(true)

const nsOptions = computed(() =>
  [...new Set(catalog.value.filter((c) => c.availability === 'platform_granted').flatMap((c) => c.namespaces))],
)

async function refresh() { detail.value = await getAdminOrg(orgId.value) }

onMounted(async () => {
  try {
    const [d, cat, pk] = await Promise.all([
      getAdminOrg(orgId.value),
      getConnectors().catch(() => ({ connectors: [] })),
      getPlatformKeys().catch(() => ({ platform_keys: [] })),
    ])
    detail.value = d
    catalog.value = cat.connectors
    pkeys.value = pk.platform_keys
  } catch (e) { error.value = humanize(e) }
  finally { loading.value = false }
})

// Entrer dans l'org EN LECTURE (opérateur plateforme) via la consultation par URL
// (`/o/:id/…`, ADR 0023) : le backend autorise un non-membre en GET-only. Navigation
// dure (recharge `me` + sidebar). Sortie = bandeau ConsultOrgBanner.
function consultOrg() {
  window.location.assign(`/o/${orgId.value}/overview`)
}

async function archiveOrg() {
  if (!detail.value) return
  const name = detail.value.org.name
  if (!await confirmAction({
    title: 'archive organization', danger: true, confirmLabel: 'Archive',
    message: `archive "${name}"? it disappears from all listings and its members fall back to their other orgs. reversible in the database.`,
  })) return
  try {
    await archiveAdminOrg(orgId.value)
    toast(`org "${name}" archived`)
    router.push('/platform/orgs')
  } catch (e) { toast(humanize(e)) }
}

function addMember() {
  openForm({
    title: 'add member', description: `to ${detail.value?.org.name}`, submitLabel: 'add',
    fields: [
      { key: 'target', label: 'email or sub', required: true, placeholder: 'user@example.com' },
      { key: 'role', label: 'role', type: 'select', initial: 'org_member',
        options: [{ value: 'org_member', label: 'member' }, { value: 'org_admin', label: 'admin' }] },
    ],
    onConfirm: async (v) => {
      try { await addAdminOrgMember(orgId.value, v.target ?? '', (v.role || 'org_member') as OrgRole); toast('member added'); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function toggleMemberRole(m: OrgMember) {
  const next = m.role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setAdminOrgMemberRole(orgId.value, m.sub, next); toast('role updated'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(m: OrgMember) {
  if (!await confirmAction({ title: 'remove member', danger: true, confirmLabel: 'Remove', message: `remove ${m.email || m.sub}?` })) return
  try { await removeAdminOrgMember(orgId.value, m.sub); toast('member removed'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

function putSecret() {
  openForm({
    title: 'shared org key', description: 'inherited by every member of this org.', submitLabel: 'set key',
    fields: [
      { key: 'provider', label: 'provider', required: true, placeholder: 'e.g. attio, lemlist' },
      { key: 'api_key', label: 'api key', type: 'password', required: true, placeholder: 'paste the key' },
      { key: 'base_url', label: 'base url', placeholder: 'optional' },
    ],
    onConfirm: async (v) => {
      try { await putAdminOrgSecret(orgId.value, v.provider ?? '', v.api_key ?? '', v.base_url || undefined); toast(`${v.provider} key set`); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function removeSecret(s: OrgSecret) {
  if (!await confirmAction({ title: 'remove shared key', danger: true, confirmLabel: 'Remove', message: `remove shared ${s.provider} key?` })) return
  try { await deleteAdminOrgSecret(orgId.value, s.provider); toast('shared key removed'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

function grantEnt() {
  openForm({
    title: 'grant entitlement', description: 'unlock a controlled namespace for the whole org.', submitLabel: 'grant',
    fields: nsOptions.value.length
      ? [{ key: 'ns', label: 'namespace', type: 'select', required: true, placeholder: 'choose a namespace',
          options: nsOptions.value.map((n) => ({ value: n, label: n })) }]
      : [{ key: 'ns', label: 'namespace', required: true, hint: 'no controlled namespace in catalog — type one' }],
    onConfirm: async (v) => {
      try { await grantOrgEntitlement(orgId.value, v.ns ?? ''); toast(`granted ${v.ns}`); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function revokeEnt(e0: OrgEntitlement) {
  if (!await confirmAction({ title: 'revoke entitlement', danger: true, confirmLabel: 'Revoke', message: `revoke ${e0.namespace}?` })) return
  try { await revokeOrgEntitlement(orgId.value, e0.namespace); toast('entitlement revoked'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

// Options de connecteur (couche 3) : accorder l'option à toute l'org (comp admin).
const PAID_OPTIONS = [{ key: 'unipile', label: 'messagerie hébergée (unipile)' }]
const orgOptionComped = (opt: string) => detail.value?.option_comps?.includes(opt) ?? false
async function toggleOrgOption(opt: string) {
  const on = !orgOptionComped(opt)
  try {
    await setOptionComp('org', String(orgId.value), opt, on)
    toast(on ? `${opt} offert à l'org (comp)` : `${opt} retiré de l'org`)
    await refresh()
  } catch (e) { toast(humanize(e)) }
}

// Clé plateforme partagée à TOUTE l'org (couche 2).
function grantOrgKey() {
  if (!pkeys.value.length) { toast('aucune clé plateforme — créez-en une dans platform · connectors'); return }
  openForm({
    title: 'partager une clé plateforme à l\'org',
    description: 'tous les membres de l\'org utiliseront cette clé plateforme (métré per-membre, jamais révélée).',
    submitLabel: 'partager',
    fields: [
      { key: 'key', label: 'clé plateforme', type: 'select', required: true,
        options: pkeys.value.map((k) => ({ value: String(k.id), label: `${k.provider}/${k.label}` })) },
      { key: 'quota', label: 'quota/jour par membre', placeholder: 'vide = défaut provider' },
    ],
    onConfirm: async (v) => {
      const quota = v.quota ? Math.max(1, Number(v.quota)) : undefined
      try { await grantOrgPlatformKey(orgId.value, Number(v.key), quota); toast('clé partagée à l\'org'); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function revokeOrgKey(g: AdminGrant) {
  if (!await confirmAction({ title: 'retirer le partage', danger: true, confirmLabel: 'Retirer', message: `retirer ${g.provider}/${g.label} de l'org ?` })) return
  try { await revokeOrgPlatformKey(orgId.value, g.platform_key_id); toast('partage retiré'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <RouterLink class="linklike" to="/platform/orgs">← organizations</RouterLink>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else-if="loading" class="helptext">chargement…</p>

    <template v-else-if="detail">
      <!-- En-tête de l'org : identité + actions transverses -->
      <div class="org-head">
        <div class="org-id">
          <span class="o-medallion o-medallion-sm" aria-hidden="true" />
          <div>
            <h1>{{ detail.org.name }}</h1>
            <div class="org-sub">{{ detail.members.length }} membre{{ detail.members.length === 1 ? '' : 's' }}</div>
          </div>
        </div>
        <div class="org-actions">
          <Btn kind="mini" icon="eye" @click="consultOrg">Consulter (lecture)</Btn>
          <Btn kind="danger" @click="archiveOrg">Archive org</Btn>
        </div>
      </div>

      <!-- Membres -->
      <ConsoleCard flush title="membres" sub="rôles dans l'org (org_admin gère l'org ; org_member consomme).">
        <template #actions><Btn kind="mini" icon="plus" @click="addMember">Add member</Btn></template>
        <table class="tbl">
          <thead><tr><th>member</th><th>role</th><th>active</th><th style="width: 140px"></th></tr></thead>
          <tbody>
            <tr v-for="m in detail.members" :key="m.sub">
              <td>
                <div style="font-weight: 600; color: var(--color-ink)">{{ m.name || m.email }}</div>
                <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
              </td>
              <td><Tag v-if="m.role === 'org_admin'" tone="ink">admin</Tag><Tag v-else>member</Tag></td>
              <td><Dot :tone="m.active ? 'olive' : 'faint'" :size="7" /></td>
              <td style="text-align: right; white-space: nowrap">
                <Btn kind="mini" @click="toggleMemberRole(m)">{{ m.role === 'org_admin' ? 'Demote' : 'Promote' }}</Btn>
                <Btn kind="danger" @click="removeMember(m)">Remove</Btn>
              </td>
            </tr>
            <tr v-if="!detail.members.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no members</td></tr>
          </tbody>
        </table>
      </ConsoleCard>

      <!-- Accès partagés : ce dont héritent tous les membres -->
      <div class="eyebrow" style="margin-top: 4px">accès partagés</div>
      <div class="grid2">
        <ConsoleCard title="clés BYO de l'org" sub="credentials posés par l'org, hérités par chaque membre.">
          <template #actions><Btn kind="mini" icon="plus" @click="putSecret">Add key</Btn></template>
          <div class="rowlist">
            <div v-for="s in detail.secrets" :key="s.provider" class="rowitem" style="gap: 12px">
              <Dot tone="olive" :size="8" />
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 13px">{{ s.provider }}</div>
                <div style="font-size: 11.5px; color: var(--color-mute)">{{ s.base_url || 'set' }}{{ s.set_at ? ` · ${fmtDate(s.set_at)}` : '' }}</div>
              </div>
              <Btn kind="danger" @click="removeSecret(s)">Remove</Btn>
            </div>
            <div v-if="!detail.secrets.length" class="helptext">no shared keys yet.</div>
          </div>
        </ConsoleCard>

        <ConsoleCard title="clés plateforme prêtées" sub="prêter une clé plateforme à toute l'org (métré per-membre, jamais révélée) — distinct des clés BYO.">
          <template #actions><Btn kind="mini" icon="plus" @click="grantOrgKey">Partager une clé</Btn></template>
          <div class="rowlist">
            <div v-for="g in (detail.platform_grants ?? [])" :key="g.platform_key_id" class="rowitem" style="gap: 12px">
              <div style="min-width: 0; flex: 1"><Tag tone="saffron">{{ g.provider }}/{{ g.label }}</Tag></div>
              <span class="dim" style="font-size: 11px">{{ g.daily_quota ? `${g.daily_quota}/j` : '∞' }}</span>
              <Btn kind="danger" @click="revokeOrgKey(g)">Retirer</Btn>
            </div>
            <div v-if="!(detail.platform_grants ?? []).length" class="helptext">aucune clé plateforme partagée.</div>
          </div>
        </ConsoleCard>
      </div>

      <!-- Débloqués : ce que l'org a le droit d'utiliser -->
      <div class="eyebrow" style="margin-top: 4px">débloqués</div>
      <div class="grid2">
        <ConsoleCard title="entitlements" sub="namespaces contrôlés débloqués pour toute l'org.">
          <template #actions><Btn kind="mini" icon="plus" @click="grantEnt">Grant</Btn></template>
          <div class="rowlist">
            <div v-for="e in (detail.entitlements ?? [])" :key="e.namespace" class="rowitem" style="gap: 12px">
              <div style="min-width: 0; flex: 1"><Tag tone="cobalt">{{ e.namespace }}</Tag></div>
              <span v-if="e.granted_at" class="dim" style="font-size: 11px">{{ fmtDate(e.granted_at) }}</span>
              <Btn kind="danger" @click="revokeEnt(e)">Revoke</Btn>
            </div>
            <div v-if="!(detail.entitlements ?? []).length" class="helptext">no entitlements granted.</div>
          </div>
        </ConsoleCard>

        <ConsoleCard title="options de connecteur" sub="accorder une option de connecteur à toute l'org (comp admin). couvre tous ses membres.">
          <div class="rowlist">
            <div v-for="o in PAID_OPTIONS" :key="o.key" class="rowitem" style="gap: 12px">
              <div style="min-width: 0; flex: 1; font-weight: 600; color: var(--color-ink)">{{ o.label }}</div>
              <Tag :tone="orgOptionComped(o.key) ? 'olive' : undefined">{{ orgOptionComped(o.key) ? 'offerte (comp)' : 'non offerte' }}</Tag>
              <Btn :kind="orgOptionComped(o.key) ? 'danger' : 'mini'" @click="toggleOrgOption(o.key)">
                {{ orgOptionComped(o.key) ? 'Retirer' : 'Accorder l\'option' }}
              </Btn>
            </div>
          </div>
        </ConsoleCard>
      </div>
    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
.org-head {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  margin: 6px 0 4px;
}
.org-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
.org-id h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--color-ink); }
.org-sub { font-size: 12.5px; color: var(--color-mute); }
.org-actions { display: flex; gap: 10px; flex: none; }
</style>
