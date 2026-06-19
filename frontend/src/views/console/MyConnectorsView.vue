<script setup lang="ts">
// « Mes connecteurs » (marketplace, ADR 0019) — les connecteurs installés dans le
// workspace (state ≠ not_selected) : bascule actif/pause, détail des outils, retrait.
// La config credential détaillée reste sur /console/connectors (non fusionnée ici).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Toggle from '@/components/console/Toggle.vue'
import {
  getMyConnectors, getTools, selectConnector, pauseConnector, unselectConnector,
  enableTool, disableTool,
} from '@/api/console'
import type { MyConnector, ToolEntry } from '@/types/api'
import { humanize } from '@/lib/errors'

const router = useRouter()
const connectors = ref<MyConnector[]>([])
const tools = ref<ToolEntry[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const busy = ref<string | null>(null)

const installed = computed(() => connectors.value.filter((c) => c.state !== 'not_selected'))

const nsOf = (toolName: string): string => toolName.split('_')[0] ?? toolName
function toolsOf(c: MyConnector): ToolEntry[] {
  const ns = new Set(c.namespaces)
  return tools.value.filter((t) => ns.has(nsOf(t.name))).sort((a, b) => a.name.localeCompare(b.name))
}
const monogram = (c: MyConnector) => (c.label || c.name).charAt(0).toUpperCase()

async function load() {
  try {
    const [mc, tl] = await Promise.all([getMyConnectors(), getTools()])
    connectors.value = mc.connectors
    tools.value = tl.tools
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

async function act(c: MyConnector, action: 'resume' | 'pause' | 'remove') {
  busy.value = c.name
  try {
    if (action === 'pause') { await pauseConnector(c.name); c.state = 'paused' }
    else if (action === 'resume') { await selectConnector(c.name); c.state = 'active' }
    else { await unselectConnector(c.name); c.state = 'not_selected' }
  } catch (e) { error.value = humanize(e) }
  finally { busy.value = null }
}

async function toggleTool(t: ToolEntry) {
  try {
    if (t.enabled) { await disableTool(t.name); t.enabled = false }
    else { await enableTool(t.name); t.enabled = true }
  } catch (e) { error.value = humanize(e) }
}
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard title="my connectors"
      sub="connectors installed in your workspace — pause one, toggle its tools, or remove it.">
      <Btn kind="mini" @click="router.push('/console/library/connectors')">+ browse library</Btn>
    </ConsoleCard>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div v-if="loaded && installed.length" class="mc-list">
      <article v-for="c in installed" :key="c.name" class="mc-card">
        <header class="mc-head">
          <div class="mc-logo">
            <img v-if="c.logo_url" :src="c.logo_url" :alt="c.label" loading="lazy" />
            <span v-else class="mc-mono">{{ monogram(c) }}</span>
          </div>
          <div class="mc-id">
            <div class="mc-name">{{ c.label }}</div>
            <div class="mc-pub">{{ c.publisher }}</div>
          </div>
          <Tag :tone="c.state === 'active' ? 'olive' : 'saffron'">{{ c.state }}</Tag>
          <Toggle :on="c.state === 'active'"
            @change="act(c, c.state === 'active' ? 'pause' : 'resume')" />
          <Btn kind="mini" :disabled="busy === c.name" @click="act(c, 'remove')">remove</Btn>
        </header>

        <div class="mc-body">
          <a v-if="c.secret_kind !== 'none'" class="mc-config"
            @click="router.push('/console/connectors')">configure credential →</a>
          <div class="mc-tools">
            <div v-for="t in toolsOf(c)" :key="t.name" class="mc-tool">
              <code class="mono mc-tname">{{ t.name }}</code>
              <Toggle :on="t.enabled" @change="toggleTool(t)" />
            </div>
            <p v-if="!toolsOf(c).length" class="mc-no-tools">no tools loaded for this connector.</p>
          </div>
        </div>
      </article>
    </div>

    <div v-else-if="loaded && !error" class="state-empty" style="margin-top: 40px">
      <h3>no connector installed yet</h3>
      <p>browse the <RouterLink to="/console/library/connectors" class="mc-link">connector library</RouterLink> to install your first one.</p>
    </div>
  </div>
</template>

<style scoped>
.mc-list { display: flex; flex-direction: column; gap: 14px; }
.mc-card {
  border: 1px solid var(--color-hair); border-radius: 12px; background: var(--color-paper);
  overflow: hidden;
}
.mc-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--color-hair-soft); }
.mc-logo {
  width: 38px; height: 38px; border-radius: 9px; flex: 0 0 auto; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-hair); background: var(--color-surface);
}
.mc-logo img { width: 100%; height: 100%; object-fit: contain; }
.mc-mono { font-family: var(--font-mono); font-weight: 700; font-size: 16px; color: var(--color-ink-soft); }
.mc-id { flex: 1; min-width: 0; }
.mc-name { font-weight: 600; font-size: 14px; line-height: 1.2; }
.mc-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; }
.mc-body { padding: 12px 16px 16px; }
.mc-config { font-size: 12px; color: var(--color-cobalt-ink); cursor: pointer; text-decoration: none; }
.mc-config:hover { text-decoration: underline; }
.mc-tools { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.mc-tool {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 5px 0; border-bottom: 1px solid var(--color-hair-soft);
}
.mc-tname { font-size: 12px; color: var(--color-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-no-tools { font-size: 12px; color: var(--color-faint); margin: 4px 0 0; }
.mc-link { color: var(--color-cobalt-ink); }
</style>
