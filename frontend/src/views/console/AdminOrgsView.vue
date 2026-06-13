<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import { useToast } from '@/composables/useToast'
import {
  getAdminOrgs, createOrg, getAdminOrg, addAdminOrgMember, setAdminOrgMemberRole,
  removeAdminOrgMember, putAdminOrgSecret, deleteAdminOrgSecret,
  grantOrgEntitlement, revokeOrgEntitlement, getConnectors,
} from '@/api/console'
import type { AdminOrgSummary, ConnectorMeta, OrgDetail, OrgMember, OrgSecret, OrgEntitlement } from '@/types/api'
import { fmtDate } from '@/types/api'

const { toast } = useToast()
const orgs = ref<AdminOrgSummary[]>([])
const detail = ref<OrgDetail | null>(null)
const selectedId = ref<number | null>(null)
const catalog = ref<ConnectorMeta[]>([])
const error = ref<string | null>(null)

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
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
})

async function select(id: number) {
  selectedId.value = id
  try { detail.value = await getAdminOrg(id) }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}

async function newOrg() {
  const name = window.prompt('organization name')?.trim()
  if (!name) return
  try { const { id } = await createOrg(name); toast(`org "${name}" created`); await loadOrgs(); await select(id) }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}

async function addMember() {
  if (selectedId.value == null) return
  const target = window.prompt('member email or sub')?.trim()
  if (!target) return
  const role = window.prompt('role (org_member / org_admin)', 'org_member')?.trim()
  if (role !== 'org_member' && role !== 'org_admin') { toast('invalid role'); return }
  try { await addAdminOrgMember(selectedId.value, target, role); toast('member added'); await refresh(); await loadOrgs() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function toggleMemberRole(m: OrgMember) {
  if (selectedId.value == null) return
  const next = m.role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setAdminOrgMemberRole(selectedId.value, m.sub, next); toast('role updated'); await refresh() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function removeMember(m: OrgMember) {
  if (selectedId.value == null || !window.confirm(`remove ${m.email || m.sub}?`)) return
  try { await removeAdminOrgMember(selectedId.value, m.sub); toast('member removed'); await refresh(); await loadOrgs() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}

async function putSecret() {
  if (selectedId.value == null) return
  const provider = window.prompt('provider (e.g. attio, lemlist)')?.trim()
  if (!provider) return
  const key = window.prompt(`paste the shared ${provider} api key`)?.trim()
  if (!key) return
  const base = window.prompt('base_url (optional — blank for none)')?.trim() || undefined
  try { await putAdminOrgSecret(selectedId.value, provider, key, base); toast(`${provider} key set`); await refresh() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function removeSecret(s: OrgSecret) {
  if (selectedId.value == null || !window.confirm(`remove shared ${s.provider} key?`)) return
  try { await deleteAdminOrgSecret(selectedId.value, s.provider); toast('shared key removed'); await refresh() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}

async function grantEnt() {
  if (selectedId.value == null) return
  const hint = nsOptions.value.join(', ') || 'no controlled namespaces in catalog'
  const ns = window.prompt(`grant a namespace to this org (${hint})`)?.trim()
  if (!ns) return
  try { await grantOrgEntitlement(selectedId.value, ns); toast(`granted ${ns}`); await refresh() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function revokeEnt(e0: OrgEntitlement) {
  if (selectedId.value == null || !window.confirm(`revoke ${e0.namespace}?`)) return
  try { await revokeOrgEntitlement(selectedId.value, e0.namespace); toast('entitlement revoked'); await refresh() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
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
        <template #actions><Btn kind="mini" icon="plus" @click="addMember">add member</Btn></template>
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
      </div>
    </template>
  </div>
</template>
