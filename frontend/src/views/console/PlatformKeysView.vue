<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import { useToast } from '@/composables/useToast'
import { getPlatformKeys, deletePlatformKey } from '@/api/console'
import type { PlatformKey } from '@/types/api'
import { fmtDate } from '@/types/api'

const { toast } = useToast()
const keys = ref<PlatformKey[]>([])
const error = ref<string | null>(null)

async function load() {
  try { keys.value = (await getPlatformKeys()).platform_keys }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
onMounted(load)

async function remove(k: PlatformKey) {
  if (!window.confirm(`delete platform key "${k.label}"?`)) return
  try { await deletePlatformKey(k.id); toast('key deleted'); await load() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard flush title="platform keys"
      sub="studio-owned api keys, lent to users via grants with a daily quota. the key itself is never shown again.">
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
