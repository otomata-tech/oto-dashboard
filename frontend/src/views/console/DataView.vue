<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { getNamespaces, createNamespace } from '@/api/console'
import type { NamespaceEntry } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { promptText } = usePrompt()
const namespaces = ref<NamespaceEntry[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

async function load() {
  try { namespaces.value = (await getNamespaces()).namespaces }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

async function create() {
  const ns = await promptText('new namespace', { label: 'name', required: true, placeholder: 'e.g. prospects-q3' })
  if (!ns) return
  try { await createNamespace(ns); toast(`namespace "${ns}" created`); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard title="datastore namespaces" flush
      sub="lightweight tabular storage your agents read &amp; write through data_* tools.">
      <template #actions>
        <Btn kind="mini" icon="plus" @click="create">new namespace</Btn>
      </template>
      <table class="tbl">
        <thead><tr><th>namespace</th><th style="width: 120px"></th></tr></thead>
        <tbody>
          <tr v-for="ns in namespaces" :key="ns.namespace">
            <td><code class="mono" style="font-weight: 600">{{ ns.namespace }}</code></td>
            <td style="text-align: right; white-space: nowrap">
              <Tag v-if="ns.shared" tone="cobalt">shared · {{ ns.permission || 'read' }}</Tag>
            </td>
          </tr>
          <tr v-if="loaded && !namespaces.length">
            <td colspan="2" class="dim" style="text-align: center; padding: 16px">
              no namespaces yet — create one to let your agents store rows.
            </td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>

    <div class="grid2">
      <ConsoleCard title="how agents use this">
        <div class="helptext" style="font-size: 12.5px; line-height: 1.65">
          <code style="font-size: 11px">data_write("prospects-q3", row)</code> appends a row ·
          <code style="font-size: 11px">data_rows("prospects-q3", filter)</code> reads it back ·
          <code style="font-size: 11px">data_share("prospects-q3", email)</code> shares it with a teammate.
          schema-free — new fields just appear.
        </div>
      </ConsoleCard>
      <ConsoleCard title="backing store" sub="native, no external dependency.">
        <div class="helptext">
          rows live in oto's own database (postgres) — datastore works without connecting any
          third-party account. exporting a namespace to a tool you control (sheets, notion…) is
          on the roadmap.
        </div>
      </ConsoleCard>
    </div>
  </div>
</template>
