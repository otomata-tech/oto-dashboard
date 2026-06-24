<script setup lang="ts">
// Cockpit connecteurs PLATEFORME (/platform/connectors, ADR 0022) — la projection
// « plateforme » du connecteur : ce que la plateforme autorise. Par connecteur :
// master switch d'activation (deny-by-default) + clé plateforme (studio-owned,
// prêtée aux users via grants). Absorbe l'ex-écran « platform keys ». Les
// entitlements de namespace restent indexés par org dans /platform/orgs (naturel).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Toggle from '@/components/console/Toggle.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import {
  getAdminConnectors, setConnectorActivation,
  getConnectors, getPlatformKeys, createPlatformKey, deletePlatformKey,
  getUnipilePlatformSeats,
} from '@/api/console'
import type { ConnectorActivation, ConnectorMeta, PlatformKey, UnipileSeat } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()
const { me } = useMe()
// Les clés plateforme sont sensibles → mutation réservée au super_admin (l'opérateur
// `admin` voit l'activation + les clés en lecture, mais ne les pose/retire pas).
const isSuperAdmin = computed(() => me.value?.role === 'super_admin')
const connectors = ref<ConnectorActivation[]>([])
const meta = ref<Record<string, ConnectorMeta>>({})
const keys = ref<PlatformKey[]>([])
const seats = ref<UnipileSeat[]>([])
const seatsConfigured = ref(false)
const error = ref<string | null>(null)
const q = ref('')

// Un connecteur peut porter une clé plateforme si son provider est platform-éligible
// (auth_modes inclut 'platform') — les byo-only la refuseraient.
const platformEligible = (name: string) => !!meta.value[name]?.auth_modes?.includes('platform')
const keysOf = (name: string) => keys.value.filter((k) => k.provider === name)

const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return connectors.value.filter((c) => !needle
    || c.connector.toLowerCase().includes(needle) || c.label.toLowerCase().includes(needle))
})

async function load() {
  try {
    const [act, cat, k] = await Promise.all([
      getAdminConnectors(),
      getConnectors().catch(() => ({ connectors: [] as ConnectorMeta[] })),
      getPlatformKeys().catch(() => ({ platform_keys: [] as PlatformKey[] })),
    ])
    connectors.value = act.connectors
    meta.value = Object.fromEntries(cat.connectors.map((c) => [c.name, c]))
    keys.value = k.platform_keys
  } catch (e) { error.value = humanize(e) }
  // Sièges de la clé plateforme unipile — réservé super_admin (révèle l'ownership
  // cross-user) ; best-effort, n'empêche pas le reste de la page.
  if (isSuperAdmin.value) {
    try {
      const s = await getUnipilePlatformSeats()
      seats.value = s.seats
      seatsConfigured.value = s.configured
    } catch { /* pas de clé plateforme ou 403 → carte masquée */ }
  }
}
onMounted(load)

const orphanCount = computed(() => seats.value.filter((s) => s.orphan).length)

async function toggle(c: ConnectorActivation) {
  const next = c.enabled !== true
  if (!next && !(await confirmAction({
    title: 'disable connector', danger: true, confirmLabel: 'disable',
    message: `disable "${c.label}" platform-wide? its tools stop loading on the next server restart.`,
  }))) return
  try {
    await setConnectorActivation(c.connector, next)
    toast(`${c.label} ${next ? 'enabled' : 'disabled'} — effective on next server restart`)
    await load()
  } catch (e) { toast(humanize(e)) }
}

async function setKey(c: ConnectorActivation) {
  const r = await promptForm({
    title: `${c.label} — platform key`,
    description: 'studio-owned key, lent to users via grants with a daily quota. shown only once.',
    fields: [
      { key: 'label', label: 'label', value: 'prod', required: true,
        hint: 're-posting the same label rotates the key' },
      { key: 'api_key', label: 'api key', type: 'password', required: true, placeholder: 'paste the key' },
    ],
    submitLabel: 'save',
  })
  if (!r) return
  try { await createPlatformKey(c.connector, r.label ?? '', r.api_key ?? ''); toast(`${c.connector}/${r.label} saved`); await load() }
  catch (e) { toast(humanize(e)) }
}

async function removeKey(k: PlatformKey) {
  if (!await confirmAction({ title: 'delete platform key', danger: true, confirmLabel: 'delete',
    message: `delete "${k.provider}/${k.label}"? grants using it will stop resolving.` })) return
  try { await deletePlatformKey(k.id); toast('key deleted'); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard title="platform connectors"
      sub="what the platform allows. master switch (deny-by-default, effective on next restart) + studio-owned platform key (lent via grants with a daily quota). namespace entitlements stay per-org in « orgs ».">
      <template #actions>
        <input v-model="q" class="cc-search" placeholder="search…" />
      </template>
      <table class="tbl">
        <thead><tr><th>connector</th><th>platform key</th><th>master</th><th style="width: 60px"></th></tr></thead>
        <tbody>
          <tr v-for="c in shown" :key="c.connector">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ c.label }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">
                {{ c.connector }} · <code class="mono">{{ c.namespaces.join(', ') }}</code>
              </div>
            </td>
            <td>
              <template v-if="platformEligible(c.connector)">
                <span v-for="k in keysOf(c.connector)" :key="k.id" class="pk">
                  <code class="mono">{{ k.label }} …{{ k.api_key_tail }}</code>
                  <button v-if="isSuperAdmin" class="pk-x" title="delete" @click="removeKey(k)">×</button>
                </span>
                <Btn v-if="isSuperAdmin" kind="mini" icon="plus" @click="setKey(c)">key</Btn>
                <span v-else-if="!keysOf(c.connector).length" class="dim" style="font-size: 11px">—</span>
              </template>
              <span v-else class="dim" style="font-size: 11px">byo-only</span>
            </td>
            <td>
              <span :style="{ fontSize: '11px', fontWeight: 600, color: c.enabled ? 'var(--color-ink)' : 'var(--color-faint)' }">
                {{ c.enabled ? 'active' : 'off' }}
              </span>
            </td>
            <td style="text-align: right"><Toggle :on="c.enabled === true" @change="toggle(c)" /></td>
          </tr>
          <tr v-if="!shown.length">
            <td colspan="4" class="dim" style="text-align: center; padding: 16px">no connectors</td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>

    <ConsoleCard title="resolution order">
      <div class="helptext" style="font-size: 12.5px">
        when a tool needs a key: <strong>user key</strong> → <strong>org shared key</strong> →
        <strong>platform grant</strong> (quota-metered) → forbidden. no key and no grant = no access until one is set.
        grant a platform key to a user from their fiche in « users ».
      </div>
    </ConsoleCard>

    <ConsoleCard v-if="isSuperAdmin && seatsConfigured" title="unipile platform key · seats"
      :sub="`accounts living on the shared unipile instance, reconciled with their oto owner. an orphan account belongs to no oto user (a churned user) and still bills ~€5/mo.${orphanCount ? ` ${orphanCount} orphan(s).` : ''}`">
      <table class="tbl">
        <thead><tr><th>account</th><th>channel</th><th>owner</th><th>status</th></tr></thead>
        <tbody>
          <tr v-for="s in seats" :key="s.account_id">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ s.name || '—' }}</div>
              <code class="mono" style="font-size: 11px; color: var(--color-faint)">{{ s.account_id }}</code>
            </td>
            <td style="font-size: 12px">{{ (s.type || '').toLowerCase() }}</td>
            <td>
              <template v-if="s.orphan">
                <span style="font-weight: 600; color: var(--color-terra-ink)">orphan</span>
                <span class="dim" style="font-size: 11px"> · no oto user</span>
              </template>
              <template v-else>
                <div style="font-size: 12.5px; color: var(--color-ink)">{{ s.owner_email }}</div>
                <div v-if="s.org_name" class="dim" style="font-size: 11px">{{ s.org_name }}</div>
              </template>
            </td>
            <td style="font-size: 11px"
              :style="{ color: s.status && s.status.toUpperCase() === 'OK' ? 'var(--color-ink)' : 'var(--color-terra-ink)' }">
              {{ s.status }}
            </td>
          </tr>
          <tr v-if="!seats.length">
            <td colspan="4" class="dim" style="text-align: center; padding: 16px">no accounts on the platform instance</td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.cc-search {
  font-size: 12px; padding: 5px 10px; border: 1px solid var(--color-hair-classic);
  border-radius: 8px; background: var(--color-surface); color: var(--color-ink); width: 200px;
}
.cc-search:focus { outline: none; border-color: var(--color-ink); }
.pk { display: inline-flex; align-items: center; gap: 3px; margin-right: 6px; }
.pk-x { border: 0; background: none; cursor: pointer; color: var(--color-terra-ink); font-size: 14px; line-height: 1; padding: 0 2px; }
</style>
