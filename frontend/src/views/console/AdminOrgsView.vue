<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useDeepLink } from '@/composables/useDeepLink'
import {
  getAdminOrgs, createOrg, getAdminOrg, archiveAdminOrg, addAdminOrgMember, setAdminOrgMemberRole,
  removeAdminOrgMember, putAdminOrgSecret, deleteAdminOrgSecret,
  grantOrgEntitlement, revokeOrgEntitlement, getConnectors, setOptionComp,
} from '@/api/console'
import type { AdminOrgSummary, ConnectorMeta, OrgDetail, OrgMember, OrgSecret, OrgEntitlement, OrgRole } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { promptText, promptForm, confirmAction } = usePrompt()
const orgs = ref<AdminOrgSummary[]>([])
const detail = ref<OrgDetail | null>(null)
const selectedId = ref<number | null>(null)
const catalog = ref<ConnectorMeta[]>([])
const error = ref<string | null>(null)

// Org sélectionnée portée par `?org=<id>` (lien direct + retour).
const dl = useDeepLink('org', (id) => {
  if (id != null && id !== selectedId.value) select(id)
  else if (id == null && selectedId.value != null) { selectedId.value = null; detail.value = null }
}, { parse: Number })

// Namespaces grant-only (sensibles) = connecteurs platform_granted du registre.
const nsOptions = computed(() =>
  [...new Set(catalog.value.filter((c) => c.availability === 'platform_granted').flatMap((c) => c.namespaces))],
)

async function loadOrgs() { orgs.value = (await getAdminOrgs()).orgs }
async function refresh() { if (selectedId.value != null) detail.value = await getAdminOrg(selectedId.value) }

onMounted(async () => {
  try {
    const [, cat] = await Promise.all([loadOrgs(), getConnectors().catch(() => ({ connectors: [] }))])
    catalog.value = cat.connectors
    const id = dl.read()
    if (id != null) await select(id)
  } catch (e) { error.value = humanize(e) }
})

async function select(id: number) {
  selectedId.value = id
  dl.set(id)
  try { detail.value = await getAdminOrg(id) }
  catch (e) { toast(humanize(e)) }
}

async function newOrg() {
  const name = await promptText('new organization', { label: 'name', required: true, placeholder: 'e.g. Acme Corp' })
  if (!name) return
  try { const { id } = await createOrg(name); toast(`org "${name}" created`); await loadOrgs(); await select(id) }
  catch (e) { toast(humanize(e)) }
}

async function archiveOrg() {
  if (selectedId.value == null || !detail.value) return
  const name = detail.value.org.name
  if (!await confirmAction({
    title: 'archive organization', danger: true, confirmLabel: 'archive',
    message: `archive "${name}"? it disappears from all listings and its members fall back to their other orgs. reversible in the database.`,
  })) return
  try {
    await archiveAdminOrg(selectedId.value)
    toast(`org "${name}" archived`)
    selectedId.value = null; detail.value = null; dl.set(null)
    await loadOrgs()
  } catch (e) { toast(humanize(e)) }
}

async function addMember() {
  if (selectedId.value == null) return
  const r = await promptForm({
    title: 'add member', description: `to ${detail.value?.org.name}`,
    fields: [
      { key: 'target', label: 'email or sub', required: true, placeholder: 'user@example.com' },
      { key: 'role', label: 'role', type: 'select', value: 'org_member',
        options: [{ value: 'org_member', label: 'member' }, { value: 'org_admin', label: 'admin' }] },
    ],
    submitLabel: 'add',
  })
  if (!r) return
  try { await addAdminOrgMember(selectedId.value, r.target ?? '', (r.role || 'org_member') as OrgRole); toast('member added'); await refresh(); await loadOrgs() }
  catch (e) { toast(humanize(e)) }
}
async function toggleMemberRole(m: OrgMember) {
  if (selectedId.value == null) return
  const next = m.role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setAdminOrgMemberRole(selectedId.value, m.sub, next); toast('role updated'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(m: OrgMember) {
  if (selectedId.value == null) return
  if (!await confirmAction({ title: 'remove member', danger: true, confirmLabel: 'remove', message: `remove ${m.email || m.sub}?` })) return
  try { await removeAdminOrgMember(selectedId.value, m.sub); toast('member removed'); await refresh(); await loadOrgs() }
  catch (e) { toast(humanize(e)) }
}

async function putSecret() {
  if (selectedId.value == null) return
  const r = await promptForm({
    title: 'shared org key', description: 'inherited by every member of this org.',
    fields: [
      { key: 'provider', label: 'provider', required: true, placeholder: 'e.g. attio, lemlist' },
      { key: 'api_key', label: 'api key', type: 'password', required: true, placeholder: 'paste the key' },
      { key: 'base_url', label: 'base url', placeholder: 'optional' },
    ],
    submitLabel: 'set key',
  })
  if (!r) return
  try { await putAdminOrgSecret(selectedId.value, r.provider ?? '', r.api_key ?? '', r.base_url || undefined); toast(`${r.provider} key set`); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function removeSecret(s: OrgSecret) {
  if (selectedId.value == null) return
  if (!await confirmAction({ title: 'remove shared key', danger: true, confirmLabel: 'remove', message: `remove shared ${s.provider} key?` })) return
  try { await deleteAdminOrgSecret(selectedId.value, s.provider); toast('shared key removed'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

async function grantEnt() {
  if (selectedId.value == null) return
  const r = await promptForm({
    title: 'grant entitlement', description: 'unlock a controlled namespace for the whole org.',
    fields: nsOptions.value.length
      ? [{ key: 'ns', label: 'namespace', type: 'select', required: true, placeholder: 'choose a namespace',
          options: nsOptions.value.map((n) => ({ value: n, label: n })) }]
      : [{ key: 'ns', label: 'namespace', required: true, hint: 'no controlled namespace in catalog — type one' }],
    submitLabel: 'grant',
  })
  if (!r) return
  try { await grantOrgEntitlement(selectedId.value, r.ns ?? ''); toast(`granted ${r.ns}`); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function revokeEnt(e0: OrgEntitlement) {
  if (selectedId.value == null) return
  if (!await confirmAction({ title: 'revoke entitlement', danger: true, confirmLabel: 'revoke', message: `revoke ${e0.namespace}?` })) return
  try { await revokeOrgEntitlement(selectedId.value, e0.namespace); toast('entitlement revoked'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

// Options payantes (couche abonnement) : offrir GRATUITEMENT l'option à toute l'org
// (comp admin org-level), distinct du Stripe payant. Couvre tous les membres de l'org.
const PAID_OPTIONS = [{ key: 'unipile', label: 'messagerie hébergée (unipile)' }]
const orgOptionComped = (opt: string) => detail.value?.option_comps?.includes(opt) ?? false
async function toggleOrgOption(opt: string) {
  if (selectedId.value == null) return
  const on = !orgOptionComped(opt)
  try {
    await setOptionComp('org', String(selectedId.value), opt, on)
    toast(on ? `${opt} offert à l'org (comp)` : `${opt} retiré de l'org`)
    await refresh()
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="grid3">
      <Stat label="organizations" :value="orgs.length" sub="shared perimeters" />
      <Stat label="total members" :value="orgs.reduce((a, o) => a + o.member_count, 0)" sub="across all orgs" />
      <Stat label="largest" :value="orgs.length ? Math.max(...orgs.map((o) => o.member_count)) : 0" sub="members in one org" />
    </div>

    <ConsoleCard flush title="organizations"
      sub="shared perimeters: members inherit org keys, doctrine and entitlements. click an org to manage it.">
      <template #actions>
        <Btn kind="mini" icon="plus" @click="newOrg">new org</Btn>
      </template>
      <table class="tbl">
        <thead><tr><th>org</th><th class="num">members</th><th style="width: 70px"></th></tr></thead>
        <tbody>
          <tr v-for="o in orgs" :key="o.id" :class="{ on: o.id === selectedId }"
            style="cursor: pointer" @click="select(o.id)">
            <td style="font-weight: 600; color: var(--color-ink)">{{ o.name }}</td>
            <td class="num">{{ o.member_count }}</td>
            <td style="text-align: right"><Btn kind="mini" @click.stop="select(o.id)">manage</Btn></td>
          </tr>
          <tr v-if="!orgs.length"><td colspan="3" class="dim" style="text-align: center; padding: 16px">no organizations</td></tr>
        </tbody>
      </table>
    </ConsoleCard>

    <template v-if="detail">
      <ConsoleCard flush :title="`${detail.org.name} · members`">
        <template #actions>
          <Btn kind="mini" icon="plus" @click="addMember">add member</Btn>
          <Btn kind="danger" @click="archiveOrg">archive org</Btn>
        </template>
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
                <Btn kind="mini" @click="toggleMemberRole(m)">{{ m.role === 'org_admin' ? 'demote' : 'promote' }}</Btn>
                <Btn kind="danger" @click="removeMember(m)">remove</Btn>
              </td>
            </tr>
            <tr v-if="!detail.members.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no members</td></tr>
          </tbody>
        </table>
      </ConsoleCard>

      <div class="grid2">
        <ConsoleCard title="shared keys" sub="org-wide credentials inherited by every member.">
          <template #actions><Btn kind="mini" icon="plus" @click="putSecret">add key</Btn></template>
          <div class="rowlist">
            <div v-for="s in detail.secrets" :key="s.provider" class="rowitem" style="gap: 12px">
              <Dot tone="olive" :size="8" />
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 13px">{{ s.provider }}</div>
                <div style="font-size: 11.5px; color: var(--color-mute)">{{ s.base_url || 'set' }}{{ s.set_at ? ` · ${fmtDate(s.set_at)}` : '' }}</div>
              </div>
              <Btn kind="danger" @click="removeSecret(s)">remove</Btn>
            </div>
            <div v-if="!detail.secrets.length" class="helptext">no shared keys yet.</div>
          </div>
        </ConsoleCard>

        <ConsoleCard title="entitlements" sub="controlled namespaces unlocked for the whole org.">
          <template #actions><Btn kind="mini" icon="plus" @click="grantEnt">grant</Btn></template>
          <div class="rowlist">
            <div v-for="e in (detail.entitlements ?? [])" :key="e.namespace" class="rowitem" style="gap: 12px">
              <div style="min-width: 0; flex: 1"><Tag tone="cobalt">{{ e.namespace }}</Tag></div>
              <span v-if="e.granted_at" class="dim" style="font-size: 11px">{{ fmtDate(e.granted_at) }}</span>
              <Btn kind="danger" @click="revokeEnt(e)">revoke</Btn>
            </div>
            <div v-if="!(detail.entitlements ?? []).length" class="helptext">no entitlements granted.</div>
          </div>
        </ConsoleCard>

        <ConsoleCard title="options payantes" sub="offrir gratuitement une option payante à TOUTE l'org (comp admin, distinct du paiement Stripe). couvre tous ses membres.">
          <div class="rowlist">
            <div v-for="o in PAID_OPTIONS" :key="o.key" class="rowitem" style="gap: 12px">
              <div style="min-width: 0; flex: 1; font-weight: 600; color: var(--color-ink)">{{ o.label }}</div>
              <Tag :tone="orgOptionComped(o.key) ? 'olive' : undefined">{{ orgOptionComped(o.key) ? 'offerte (comp)' : 'non offerte' }}</Tag>
              <Btn :kind="orgOptionComped(o.key) ? 'danger' : 'mini'" @click="toggleOrgOption(o.key)">
                {{ orgOptionComped(o.key) ? 'retirer' : 'offrir l\'option' }}
              </Btn>
            </div>
          </div>
        </ConsoleCard>
      </div>
    </template>
  </div>
</template>
