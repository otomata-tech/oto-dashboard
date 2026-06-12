<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import Toggle from '@/components/console/Toggle.vue'
import { useToast } from '@/composables/useToast'
import {
  getTools, enableTool, disableTool, getPresets, applyPreset as applyPresetApi,
  savePreset, deletePreset,
} from '@/api/console'
import type { PresetEntry, ToolEntry } from '@/types/api'
import { fmtDate } from '@/types/api'

const { toast } = useToast()
const tools = ref<ToolEntry[]>([])
const presets = ref<PresetEntry[]>([])
const error = ref<string | null>(null)
const busy = ref<string | null>(null)

const enabledCount = computed(() => tools.value.filter((t) => t.enabled).length)

// Regroupe les tools par préfixe (search_*, attio_*, …) — le backend expose
// une liste plate ; le groupe = ce qui précède le premier underscore.
interface Group { id: string; tools: ToolEntry[] }
const groups = computed<Group[]>(() => {
  const by = new Map<string, ToolEntry[]>()
  for (const t of tools.value) {
    const g = t.name.includes('_') ? t.name.slice(0, t.name.indexOf('_')) : t.name
    if (!by.has(g)) by.set(g, [])
    by.get(g)!.push(t)
  }
  return [...by.entries()].map(([id, ts]) => ({ id, tools: ts })).sort((a, b) => a.id.localeCompare(b.id))
})

async function load() {
  try {
    const [t, p] = await Promise.all([getTools(), getPresets().catch(() => ({ presets: [] }))])
    tools.value = t.tools
    presets.value = p.presets
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
onMounted(load)

function groupEnabled(g: Group) { return g.tools.filter((t) => t.enabled).length }

async function toggleGroup(g: Group) {
  const turnOff = groupEnabled(g) > 0
  busy.value = g.id
  try {
    await Promise.all(g.tools.map((t) =>
      turnOff ? (t.enabled ? disableTool(t.name) : Promise.resolve())
              : (t.enabled ? Promise.resolve() : enableTool(t.name)),
    ))
    tools.value = (await getTools()).tools
    toast(`${g.id} ${turnOff ? 'disabled' : 'enabled'}`)
  } catch (e) { toast(e instanceof Error ? e.message : 'failed') }
  finally { busy.value = null }
}

async function apply(name: string) {
  try { await applyPresetApi(name); tools.value = (await getTools()).tools; toast(`preset "${name}" applied`) }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function saveCurrent() {
  const name = window.prompt('preset name')?.trim()
  if (!name) return
  try { await savePreset(name); presets.value = (await getPresets()).presets; toast(`preset "${name}" saved`) }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
async function remove(name: string) {
  if (!window.confirm(`delete preset "${name}"?`)) return
  try { await deletePreset(name); presets.value = (await getPresets()).presets; toast('preset deleted') }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="grid3">
      <Stat label="tools exposed" :value="enabledCount" :unit="'/ ' + tools.length" sub="what your mcp clients see" />
      <Stat label="groups" :value="groups.filter((g) => groupEnabled(g) > 0).length" :unit="'/ ' + groups.length" sub="toggle a whole group at once" />
      <Stat label="presets" :value="presets.length" sub="one-click tool selections" />
    </div>

    <div class="grid23">
      <ConsoleCard title="tool groups" flush
        sub="fewer tools = sharper agents. disable whole groups to slim down what your clients see.">
        <table class="tbl">
          <thead><tr><th style="width: 36px"></th><th>group</th><th>sample</th><th class="num">enabled</th></tr></thead>
          <tbody>
            <tr v-for="g in groups" :key="g.id" :style="busy === g.id ? { opacity: 0.5 } : undefined">
              <td><Toggle :on="groupEnabled(g) > 0" @change="toggleGroup(g)" /></td>
              <td>
                <div :style="{ fontWeight: 600, color: groupEnabled(g) > 0 ? 'var(--color-ink)' : 'var(--color-faint)' }">{{ g.id }}</div>
              </td>
              <td><code class="mono" :style="{ color: groupEnabled(g) > 0 ? undefined : 'var(--color-faint)' }">{{ g.tools.slice(0, 3).map((t) => t.name).join('  ') }}</code></td>
              <td class="num" :style="{ color: groupEnabled(g) === 0 ? 'var(--color-faint)' : groupEnabled(g) < g.tools.length ? 'var(--color-saffron-ink)' : undefined }">
                {{ groupEnabled(g) }}/{{ g.tools.length }}
              </td>
            </tr>
          </tbody>
        </table>
      </ConsoleCard>

      <ConsoleCard title="presets" sub="saved selections — switch your whole toolbox in one move.">
        <template #actions>
          <Btn kind="mini" icon="plus" @click="saveCurrent">save current</Btn>
        </template>
        <div class="rowlist">
          <div v-for="p in presets" :key="p.name" class="rowitem" style="gap: 12px">
            <div style="min-width: 0; flex: 1">
              <div style="font-weight: 600; font-size: 13px">{{ p.name }}
                <span style="font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); margin-left: 4px">{{ p.tool_count }} tools</span>
              </div>
              <div style="font-size: 11.5px; color: var(--color-mute)">updated {{ fmtDate(p.updated_at) ?? '—' }}</div>
            </div>
            <Btn kind="mini" @click="apply(p.name)">apply</Btn>
            <Btn kind="danger" @click="remove(p.name)">delete</Btn>
          </div>
          <div v-if="!presets.length" class="helptext">no presets yet — tune your tools then “save current”.</div>
        </div>
        <div class="helptext" style="margin-top: 10px">
          presets also work from the cli: <code style="font-size: 10.5px">oto tools use &lt;name&gt;</code>
        </div>
      </ConsoleCard>
    </div>
  </div>
</template>
