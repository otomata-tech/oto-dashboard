<script setup lang="ts">
// Browse Memento — connecter SON compte memento (OAuth per-user, otomata#16) puis
// parcourir ses KB DANS oto : arbre workspaces → pages (documents) → contenu (blocs).
// La curation (édition) reste sur me.mento.cc ; ici c'est de la lecture. Le contenu
// est relayé par le backend via le token per-user (GET /api/memento/{workspaces,pages,document}).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import MarkdownView from '@/components/console/MarkdownView.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import {
  getMementoStatus, startMementoOauth, disconnectMemento,
  getMementoWorkspaces, getMementoPages, getMementoDocument,
} from '@/api/console'
import type {
  MementoStatus, MementoWorkspaces, MementoOrg, MementoPage, MementoDocumentBody,
} from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const MEMENTO_APP = 'https://me.mento.cc'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const memento = ref<MementoStatus | null>(null)
const workspaces = ref<MementoWorkspaces | null>(null)
const loaded = ref(false)
const wsLoading = ref(false)

// Sélection courante : KB → pages → page ouverte.
const selectedWs = ref<{ slug: string; name: string } | null>(null)
const pages = ref<MementoPage[]>([])
const pagesCursor = ref<string | null>(null)
const pagesMore = ref(false)
const pagesLoading = ref(false)
const doc = ref<MementoDocumentBody | null>(null)
const docLoading = ref(false)

// Orgs porteuses d'au moins une KB (les orgs vides n'ont rien à afficher).
const orgs = computed<MementoOrg[]>(() =>
  (workspaces.value?.orgs ?? []).filter((o) => o.workspaces.length > 0))

const visTone = (v: string) =>
  v === 'public' ? 'olive' : v === 'private' ? 'saffron' : 'cobalt'
const statusTone = (s: string) => (s === 'DEPRECATED' ? 'saffron' : 'olive')

// Le lien viewer vient du MCP memento distant : ne jamais binder un href sans
// valider le scheme (défense en profondeur contre un javascript:/data: injecté).
const safeHref = (u?: string): string | undefined =>
  u && /^https?:\/\//i.test(u) ? u : undefined

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

async function selectKb(slug: string, name: string) {
  selectedWs.value = { slug, name }
  doc.value = null
  pages.value = []
  pagesCursor.value = null
  await loadPages()
}

async function loadPages(more = false) {
  if (!selectedWs.value) return
  pagesLoading.value = true
  try {
    const res = await getMementoPages(selectedWs.value.slug, more ? pagesCursor.value ?? undefined : undefined)
    pages.value = more ? [...pages.value, ...res.items] : res.items
    pagesCursor.value = res.cursor ?? null
    pagesMore.value = !!res.hasMore
  } catch (e) { toast(humanize(e)) }
  finally { pagesLoading.value = false }
}

async function openPage(p: MementoPage) {
  docLoading.value = true
  doc.value = null
  try {
    const res = await getMementoDocument({ id: p.id })
    doc.value = res.document ?? null
  } catch (e) { toast(humanize(e)) }
  finally { docLoading.value = false }
}

function closePage() { doc.value = null }

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
    title: 'disconnect memento', danger: true, confirmLabel: 'Disconnect',
    message: 'disconnect your memento workspace? its tools disappear from your session — your knowledge base itself is untouched.',
  })) return
  try {
    await disconnectMemento(); toast('memento disconnected')
    workspaces.value = null; selectedWs.value = null; pages.value = []; doc.value = null
    await load()
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard title="knowledge base"
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
        <Btn v-if="loaded && memento?.connected" kind="danger" @click="disconnect">Disconnect</Btn>
        <Btn v-else-if="loaded" kind="mini" @click="connect">Connect</Btn>
      </div>
    </ConsoleCard>

    <!-- browse : arbre des KB (gauche) + pages / contenu de la KB choisie (droite) -->
    <ConsoleCard v-if="memento?.connected" title="browse your knowledge" flush
      :sub="wsLoading ? 'loading…' : 'read-only here — curation & editing happen in the memento app.'">
      <template #actions>
        <a class="btn-mini" :href="MEMENTO_APP" target="_blank" rel="noopener">open memento ↗</a>
      </template>

      <div v-if="!wsLoading && !orgs.length" class="dim" style="text-align: center; padding: 24px">
        no knowledge bases yet — create one in
        <a :href="MEMENTO_APP" target="_blank" rel="noopener">the memento app</a>.
      </div>

      <div v-else class="browse">
        <!-- rail gauche : les KB, sélectionnables -->
        <div class="rail">
          <div v-for="o in orgs" :key="o.org" class="rail-org">
            <div class="rail-org-head">
              <span class="eyebrow">org</span>
              <span class="rail-org-name">{{ o.name }}</span>
              <Tag v-if="o.personal" tone="ink">personal</Tag>
            </div>
            <button v-for="w in o.workspaces" :key="w.slug" type="button"
              class="kb" :class="{ on: selectedWs?.slug === w.slug }"
              @click="selectKb(w.slug, w.name)">
              <span class="kb-name">{{ w.name }}</span>
              <Tag :tone="visTone(w.visibility)">{{ w.visibility }}</Tag>
            </button>
          </div>
        </div>

        <!-- panneau droit : pages de la KB, ou contenu d'une page -->
        <div class="pane">
          <div v-if="!selectedWs" class="dim pane-empty">select a knowledge base to browse its pages.</div>

          <!-- contenu d'une page -->
          <template v-else-if="doc || docLoading">
            <div class="crumb">
              <button type="button" class="crumb-back" @click="closePage">← {{ selectedWs.name }}</button>
            </div>
            <div v-if="docLoading" class="dim pane-empty">loading page…</div>
            <div v-else-if="doc">
              <div class="doc-head">
                <h3 class="doc-title">{{ doc.title }}</h3>
                <a v-if="safeHref(doc.url)" class="btn-mini" :href="safeHref(doc.url)" target="_blank" rel="noopener">open ↗</a>
              </div>
              <div v-for="b in doc.blocks" :key="b.id" class="block">
                <span class="block-type">{{ b.type }}</span>
                <MarkdownView :source="b.content" />
              </div>
              <div v-if="!doc.blocks.length" class="dim pane-empty">this page has no content blocks.</div>
            </div>
          </template>

          <!-- liste des pages -->
          <template v-else>
            <div class="crumb"><span class="crumb-here">{{ selectedWs.name }}</span></div>
            <div v-if="pagesLoading && !pages.length" class="dim pane-empty">loading pages…</div>
            <div v-else-if="!pages.length" class="dim pane-empty">no pages in this knowledge base yet.</div>
            <div v-else class="rowlist">
              <button v-for="p in pages" :key="p.id" type="button" class="rowitem page" @click="openPage(p)">
                <div style="flex: 1; min-width: 0">
                  <div class="page-title">{{ p.title }}</div>
                  <div class="dim page-path">{{ p.docPath }}</div>
                </div>
                <Tag :tone="statusTone(p.status)">{{ p.status.toLowerCase() }}</Tag>
              </button>
            </div>
            <div v-if="pagesMore" style="padding: 10px 16px">
              <Btn kind="mini" :disabled="pagesLoading" @click="loadPages(true)">
                {{ pagesLoading ? 'Loading…' : 'Load more' }}
              </Btn>
            </div>
          </template>
        </div>
      </div>
    </ConsoleCard>

    <ConsoleCard v-if="memento?.connected" title="how agents use this">
      <div class="helptext" style="font-size: 12.5px; line-height: 1.65">
        the same knowledge you browse here is available to your agents: once connected,
        <code style="font-size: 11px">mem_*</code> tools appear in your session — search across your
        KBs, read documents, append sourced facts. curation and editing happen in the memento app.
      </div>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.browse { display: grid; grid-template-columns: 260px 1fr; min-height: 320px; }
.rail { border-right: 1px solid var(--color-hair); padding: 6px 0; overflow-y: auto; }
.rail-org { padding: 6px 0 10px; }
.rail-org + .rail-org { border-top: 1px solid var(--color-hair); }
.rail-org-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px 4px; }
.eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-mute); font-weight: 600; }
.rail-org-name { font-weight: 700; color: var(--color-ink); font-size: 13px; }
.kb {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px 14px; background: none; border: 0; text-align: left; cursor: pointer;
  border-left: 2px solid transparent; color: inherit; font: inherit;
}
.kb:hover { background: var(--color-paper-3); }
.kb.on { background: var(--color-paper-3); border-left-color: var(--color-cobalt-ink); }
.kb-name { flex: 1; min-width: 0; font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pane { min-width: 0; padding: 4px 0; }
.pane-empty { text-align: center; padding: 40px 16px; font-size: 13px; }
.crumb { padding: 10px 16px 6px; border-bottom: 1px solid var(--color-hair); }
.crumb-here { font-weight: 700; font-size: 13px; }
.crumb-back { background: none; border: 0; cursor: pointer; color: var(--color-cobalt-ink); font: inherit; font-weight: 600; padding: 0; }
.page {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 10px 16px; background: none; border: 0; text-align: left; cursor: pointer; color: inherit; font: inherit;
}
.page:hover { background: var(--color-paper-3); }
.page-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-path { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px 4px; }
.doc-title { flex: 1; min-width: 0; font-size: 16px; font-weight: 700; margin: 0; }
.block { padding: 8px 16px 12px; }
.block + .block { border-top: 1px solid var(--color-hair-soft); }
.block-type {
  display: inline-block; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--color-mute); font-weight: 700; margin-bottom: 2px;
}
@media (max-width: 720px) {
  .browse { grid-template-columns: 1fr; }
  .rail { border-right: 0; border-bottom: 1px solid var(--color-hair); }
}
</style>
