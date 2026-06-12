<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { getNamespaces, createNamespace, getNamespaceUrl } from '@/api/console'

const { toast } = useToast()
const namespaces = ref<string[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

async function load() {
  try { namespaces.value = (await getNamespaces()).namespaces }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loaded.value = true }
}
onMounted(load)

async function create() {
  const ns = window.prompt('namespace name (e.g. prospects-q3)')?.trim()
  if (!ns) return
  try { await createNamespace(ns); toast(`namespace "${ns}" created`); await load() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function openSheet(ns: string) {
  try { const { url } = await getNamespaceUrl(ns); window.open(url, '_blank', 'noopener') }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard title="datastore namespaces" flush
      sub="each namespace is a google sheet your agents read &amp; write through datastore_* tools.">
      <template #actions>
        <Btn kind="mini" icon="plus" @click="create">new namespace</Btn>
      </template>
      <table class="tbl">
        <thead><tr><th>namespace</th><th style="width: 130px"></th></tr></thead>
        <tbody>
          <tr v-for="ns in namespaces" :key="ns">
            <td><code class="mono" style="font-weight: 600">{{ ns }}</code></td>
            <td style="text-align: right; white-space: nowrap">
              <Btn kind="mini" icon="ext" @click="openSheet(ns)">open sheet</Btn>
            </td>
          </tr>
          <tr v-if="loaded && !namespaces.length">
            <td colspan="2" class="dim" style="text-align: center; padding: 16px">
              no namespaces yet — needs a linked google account.
            </td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>

    <div class="grid2">
      <ConsoleCard title="how agents use this">
        <div class="helptext" style="font-size: 12.5px; line-height: 1.65">
          <code style="font-size: 11px">datastore_set("prospects-q3", row)</code> appends to the sheet ·
          <code style="font-size: 11px">datastore_query("prospects-q3", filter)</code> reads it back.
          the sheet stays yours — share it, pivot it, plug it into looker. oto never locks your data in.
        </div>
      </ConsoleCard>
      <ConsoleCard title="backing store" sub="datastore is google sheets under the hood.">
        <div class="helptext">
          each namespace is a real sheet in your linked google drive. revoke the grant in
          <strong>connectors</strong> and the tools lose access — your data stays in your drive.
        </div>
      </ConsoleCard>
    </div>
  </div>
</template>
