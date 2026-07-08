<script setup lang="ts">
// Cockpit connecteurs PLATEFORME (/platform/connectors, ADR 0022) — la projection
// « plateforme » du connecteur : ce que la plateforme autorise. Par connecteur :
// master switch d'activation (deny-by-default) + clé plateforme (studio-owned,
// prêtée aux users via grants). Absorbe l'ex-écran « platform keys ». Les
// entitlements de namespace restent indexés par org dans /platform/orgs (naturel).
// Même présentation que les projections user/org : une CARTE par connecteur
// (`ConnectorAdminCard`, shell partagé ADR 0024 §3) — plus de table.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import ConnectorAdminCard from '@/components/console/ConnectorAdminCard.vue'
import CategoryChips from '@/components/console/CategoryChips.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useMe } from '@/composables/useMe'
import {
  getAdminConnectors, setConnectorActivation,
  getConnectors, getPlatformKeys, createPlatformKey, deletePlatformKey,
  getUnipilePlatformSeats,
} from '@/api/console'
import type { ConnectorActivation, ConnectorMeta, PlatformKey, UnipileSeat } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
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
const category = ref<string | null>(null)

const keysOf = (name: string) => keys.value.filter((k) => k.provider === name)
// Catégorie d'un connecteur = celle du registre (les lignes d'activation ne la portent pas).
const catOf = (name: string) => meta.value[name]?.category ?? ''

// Tri : actifs d'abord puis libellé — même lecture que les listes user et org.
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return connectors.value
    .filter((c) => !category.value || catOf(c.connector) === category.value)
    .filter((c) => !needle
      || c.connector.toLowerCase().includes(needle) || c.label.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.enabled === true) - Number(a.enabled === true) || a.label.localeCompare(b.label))
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
    title: 'disable connector', danger: true, confirmLabel: 'Disable',
    message: `disable "${c.label}" platform-wide? its tools stop loading on the next server restart.`,
  }))) return
  try {
    await setConnectorActivation(c.connector, next)
    toast(`${c.label} ${next ? 'enabled' : 'disabled'} — effective on next server restart`)
    await load()
  } catch (e) { toast(humanize(e)) }
}

function setKey(c: ConnectorActivation) {
  openForm({
    title: `${c.label} — platform key`,
    description: 'studio-owned key, lent to users via grants with a daily quota. shown only once.',
    submitLabel: 'save',
    fields: [
      { key: 'label', label: 'label', initial: 'prod', required: true,
        hint: 're-posting the same label rotates the key' },
      { key: 'api_key', label: 'api key', type: 'password', required: true, placeholder: 'paste the key' },
      // ADR 0044 §F : version d'API portée par la clé (unipile v2 = compte/clé distincts).
      ...(c.connector === 'unipile'
        ? [{ key: 'api_version', label: 'API version', type: 'select' as const, initial: 'v1',
            options: [{ value: 'v1', label: 'v1 (par défaut)' }, { value: 'v2', label: 'v2' }] }]
        : []),
    ],
    onConfirm: async (v) => {
      try { await createPlatformKey(c.connector, v.label ?? '', v.api_key ?? '', v.api_version); toast(`${c.connector}/${v.label} saved`); await load() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}

async function removeKey(k: PlatformKey) {
  if (!await confirmAction({ title: 'delete platform key', danger: true, confirmLabel: 'Delete',
    message: `delete "${k.provider}/${k.label}"? grants using it will stop resolving.` })) return
  try { await deletePlatformKey(k.provider, k.label); toast('key deleted'); await load() }
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
      <CategoryChips :values="connectors.map((c) => catOf(c.connector))" v-model="category" />
    </ConsoleCard>

    <!-- Une carte par connecteur — même shell que les vues user (/connectors) et
         org (/org/connectors), corps = leviers plateforme. -->
    <div class="accards">
      <ConnectorAdminCard v-for="c in shown" :key="c.connector"
        :activation="c" :meta="meta[c.connector]" :keys="keysOf(c.connector)"
        :is-super-admin="isSuperAdmin"
        @toggle="toggle(c)" @set-key="setKey(c)" @remove-key="removeKey" />
    </div>
    <p v-if="!shown.length" class="helptext" style="text-align: center; padding: 16px">no connectors</p>

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

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
.cc-search {
  font-size: 12px; padding: 5px 10px; border: 1px solid var(--color-hair-classic);
  border-radius: 8px; background: var(--color-surface); color: var(--color-ink); width: 200px;
}
.cc-search:focus { outline: none; border-color: var(--color-ink); }
/* Pile de cartes plateforme — même rythme que les listes user (.cc-grid) et org (.occards). */
.accards { display: flex; flex-direction: column; gap: 12px; }
</style>
