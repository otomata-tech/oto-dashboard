<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import {
  getMementoStatus, startMementoOauth, disconnectMemento, getMementoWorkspaces,
} from '@/api/console'
import type { MementoStatus, MementoWorkspaces, MementoOrg } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const MEMENTO_APP = 'https://me.mento.cc'
const wsLink = (slug: string) => `${MEMENTO_APP}/w/${encodeURIComponent(slug)}`

const { toast } = useToast()
const { confirmAction } = usePrompt()
const memento = ref<MementoStatus | null>(null)
const workspaces = ref<MementoWorkspaces | null>(null)
const loaded = ref(false)
const wsLoading = ref(false)

// Orgs porteuses d'au moins une KB (les orgs vides ne servent à rien à afficher).
const orgs = computed<MementoOrg[]>(() =>
  (workspaces.value?.orgs ?? []).filter((o) => o.workspaces.length > 0))

const visTone = (v: string) =>
  v === 'public' ? 'olive' : v === 'private' ? 'saffron' : 'cobalt'

async function load() {
  try { memento.value = await getMementoStatus() }
  catch { memento.value = null }
  finally { loaded.value = true }
  if (memento.value?.connected) loadWorkspaces()
}

async function loadWorkspaces() {
  wsLoading.value = true
  try { workspaces.value = await getMementoWorkspaces() }
  catch { workspaces.value = null }
  finally { wsLoading.value = false }
}

onMounted(() => {
  // Retour du consentement OAuth memento (redirige avec ?memento=connected|error).
  const p = new URLSearchParams(window.location.search).get('memento')
  if (p === 'connected') toast('memento connecté')
  else if (p === 'error') toast('échec de la connexion memento')
  load()
})

async function connect() {
  try { const { auth_url } = await startMementoOauth(); window.location.href = auth_url }
  catch (e) { toast(humanize(e)) }
}

async function disconnect() {
  if (!await confirmAction({
    title: 'disconnect memento', danger: true, confirmLabel: 'disconnect',
    message: 'disconnect your memento workspace? its tools disappear from your session — your knowledge base itself is untouched.',
  })) return
  try { await disconnectMemento(); toast('memento disconnected'); workspaces.value = null; await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard title="knowledge base" flush
      sub="memento — a structured, sourced knowledge base for your agents. opt-in.">
      <div class="rowitem" style="gap: 12px">
        <Dot :tone="memento?.connected ? 'olive' : 'faint'" :size="8" />
        <div style="flex: 1; min-width: 0">
          <div style="font-weight: 600">memento</div>
          <div class="dim" style="font-size: 12px">
            {{ memento?.connected
              ? `connected ${fmtDate(memento.set_at) ?? ''} · agents can read & write your KBs`
              : 'not connected — your agents have no knowledge base yet' }}
          </div>
        </div>
        <Btn v-if="loaded && memento?.connected" kind="danger" @click="disconnect">disconnect</Btn>
        <Btn v-else-if="loaded" kind="mini" @click="connect">connect</Btn>
      </div>
    </ConsoleCard>

    <!-- carte read-only : on liste les KB, la curation reste sur me.mento.cc -->
    <ConsoleCard v-if="memento?.connected" title="your knowledge bases" flush
      :sub="wsLoading ? 'loading…' : 'read-only here — open, browse & edit in the memento app.'">
      <template #actions>
        <a class="btn-mini" :href="MEMENTO_APP" target="_blank" rel="noopener">open memento ↗</a>
      </template>

      <div v-if="!wsLoading && !orgs.length" class="dim" style="text-align: center; padding: 24px">
        no knowledge bases yet — create one in
        <a :href="MEMENTO_APP" target="_blank" rel="noopener">the memento app</a>.
      </div>

      <div v-else class="ws-orgs">
        <div v-for="o in orgs" :key="o.org" class="ws-org">
          <div class="ws-org-head">
            <span class="ws-org-name">{{ o.name }}</span>
            <Tag v-if="o.personal" tone="ink">personal</Tag>
          </div>
          <div class="rowlist">
            <a v-for="w in o.workspaces" :key="w.slug"
              class="rowitem ws-item" :href="wsLink(w.slug)" target="_blank" rel="noopener">
              <div style="flex: 1; min-width: 0">
                <div class="ws-name">{{ w.name }}</div>
                <div v-if="w.summary" class="dim ws-summary">{{ w.summary }}</div>
              </div>
              <Tag :tone="visTone(w.visibility)">{{ w.visibility }}</Tag>
            </a>
          </div>
        </div>
      </div>
    </ConsoleCard>

    <div class="grid2">
      <ConsoleCard title="how agents use this">
        <div class="helptext" style="font-size: 12.5px; line-height: 1.65">
          once connected, <code style="font-size: 11px">mem_*</code> tools appear in your session:
          search across your KBs, read documents, append sourced facts. curation and editing happen
          in the memento app.
        </div>
      </ConsoleCard>
      <ConsoleCard title="datastore vs knowledge" sub="two memory surfaces.">
        <div class="helptext">
          <strong>datastore</strong> = lightweight tabular rows you own outright.
          <strong>knowledge</strong> = a structured, sourced KB (memento) — opt-in, and your
          account is provisioned automatically when you connect.
        </div>
      </ConsoleCard>
    </div>
  </div>
</template>

<style scoped>
.ws-orgs { display: flex; flex-direction: column; }
.ws-org + .ws-org { border-top: 1px solid var(--color-hair-soft); }
.ws-org-head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px 4px;
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
}
.ws-org-name { font-weight: 600; color: var(--color-ink-soft); }
.ws-item {
  display: flex; align-items: center; gap: 12px;
  text-decoration: none; color: inherit; cursor: pointer;
}
.ws-item:hover { background: var(--color-paper-3); }
.ws-name { font-weight: 600; }
.ws-summary {
  font-size: 12px; line-height: 1.45; margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
</style>
