<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { getPlatformKeys, createPlatformKey, deletePlatformKey, getConnectors } from '@/api/console'
import type { ConnectorMeta, PlatformKey } from '@/types/api'
import { fmtDate } from '@/types/api'

const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()
const keys = ref<PlatformKey[]>([])
const catalog = ref<ConnectorMeta[]>([])
const error = ref<string | null>(null)

// Seuls les providers platform-éligibles (auth_modes inclut 'platform') peuvent
// porter une clé plateforme — les byo-only (attio/lemlist/…) la refuseraient.
const platformProviders = computed(() =>
  catalog.value.filter((c) => c.auth_modes.includes('platform')).map((c) => c.name),
)

async function load() {
  try {
    const [k, cat] = await Promise.all([getPlatformKeys(), getConnectors().catch(() => ({ connectors: [] }))])
    keys.value = k.platform_keys
    catalog.value = cat.connectors
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
onMounted(load)

async function create() {
  const providers = platformProviders.value.length ? platformProviders.value : ['serper', 'hunter', 'sirene', 'kaspr']
  const r = await promptForm({
    title: 'new platform key',
    description: 'studio-owned key, lent to users via grants with a daily quota.',
    fields: [
      { key: 'provider', label: 'provider', type: 'select', required: true,
        placeholder: 'choose a provider', options: providers.map((p) => ({ value: p, label: p })) },
      { key: 'label', label: 'label', value: 'prod', required: true,
        hint: 're-posting the same provider + label rotates the key' },
      { key: 'api_key', label: 'api key', type: 'password', required: true, placeholder: 'paste the key' },
    ],
    submitLabel: 'create',
  })
  if (!r) return
  try { await createPlatformKey(r.provider ?? '', r.label ?? '', r.api_key ?? ''); toast(`${r.provider}/${r.label} saved`); await load() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}

async function remove(k: PlatformKey) {
  if (!await confirmAction({ title: 'delete platform key', danger: true, confirmLabel: 'delete',
    message: `delete "${k.provider}/${k.label}"? grants using it will stop resolving.` })) return
  try { await deletePlatformKey(k.id); toast('key deleted'); await load() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard flush title="platform keys"
      sub="studio-owned api keys, lent to users via grants with a daily quota. the key itself is never shown again.">
      <template #actions>
        <Btn kind="mini" icon="plus" @click="create">new key</Btn>
      </template>
      <table class="tbl">
        <thead><tr><th>provider</th><th>label</th><th>key</th><th>created</th><th style="width: 90px"></th></tr></thead>
        <tbody>
          <tr v-for="k in keys" :key="k.id">
            <td style="font-weight: 600; color: var(--color-ink)">{{ k.provider }}</td>
            <td class="dim">{{ k.label }}</td>
            <td><code class="mono">…{{ k.api_key_tail }}</code></td>
            <td class="dim">{{ fmtDate(k.created_at) }}</td>
            <td style="text-align: right"><Btn kind="danger" @click="remove(k)">delete</Btn></td>
          </tr>
          <tr v-if="!keys.length"><td colspan="5" class="dim" style="text-align: center; padding: 16px">no platform keys</td></tr>
        </tbody>
      </table>
    </ConsoleCard>
    <ConsoleCard title="resolution order">
      <div class="helptext" style="font-size: 12.5px">
        when a tool needs a key: <strong>user key</strong> → <strong>org shared key</strong> → <strong>platform grant</strong> (quota-metered) → <ErrLabel>forbidden</ErrLabel>.
        guests get nothing until approved.
      </div>
    </ConsoleCard>
  </div>
</template>
