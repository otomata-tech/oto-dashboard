<script setup lang="ts">
// Bibliothèque de procédures publiques (marketplace) — cherchable, partageable.
// Chaque entrée a un AUTEUR : Otomata (la plateforme) ou un créateur privé (une org).
// Preview du markdown + FORK dans son org active (copie versionnée).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useDeepLink } from '@/composables/useDeepLink'
import { useMe } from '@/composables/useMe'
import {
  listLibraryDoctrines, getLibraryDoctrine, forkLibraryDoctrine, unpublishDoctrine, getToolRegistry,
} from '@/api/console'
import { buildReg, type ToolReg } from '@/components/console/doctrine/tools'
import DoctrineContent from '@/components/console/doctrine/DoctrineContent.vue'
import ReferencedTools from '@/components/console/doctrine/ReferencedTools.vue'
import type { LibraryEntry, LibraryDoctrine } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const router = useRouter()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me } = useMe()

const entries = ref<LibraryEntry[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const q = ref('')
const author = ref<'all' | 'otomata' | 'org'>('all')
const category = ref<string | null>(null)

const selected = ref<LibraryDoctrine | null>(null)
const previewing = ref(false)
const busy = ref(false)

// Procédure en preview portée par `?preview=<slug>` (lien direct + retour).
const dl = useDeepLink('preview', (slug) => {
  if (slug && selected.value?.slug !== slug) openSlug(slug)
  else if (!slug && previewing.value) closePreview()
})
// Registre d'outils résolu — pour rendre les <tool:slug> en chips + le manifeste
// « outils référencés », comme l'éditeur de procédure (cohérence ADR 0014).
const reg = ref<ToolReg>(buildReg([]))

async function load() {
  loaded.value = false
  try {
    const params: { q?: string; author?: string } = {}
    if (q.value.trim()) params.q = q.value.trim()
    if (author.value !== 'all') params.author = author.value
    entries.value = (await listLibraryDoctrines(params)).doctrines
    error.value = null
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(async () => {
  await load()
  try { reg.value = buildReg((await getToolRegistry()).tools) } catch { /* registre optionnel */ }
  const slug = dl.read()
  if (slug) await openSlug(slug)
})

const categories = computed(() => {
  const s = new Set<string>()
  for (const e of entries.value) if (e.category) s.add(e.category)
  return [...s].sort()
})
const shown = computed(() =>
  category.value ? entries.value.filter((e) => e.category === category.value) : entries.value)

const isPlatformAdmin = computed(() => me.value?.role === 'admin' || me.value?.role === 'super_admin')
function canUnpublish(e: LibraryEntry | LibraryDoctrine): boolean {
  if (isPlatformAdmin.value) return true
  return e.author_kind === 'org' && e.author_org_id != null
    && me.value?.active_org === e.author_org_id && me.value?.org_role === 'org_admin'
}

async function openSlug(slug: string) {
  previewing.value = true
  dl.set(slug)
  try { selected.value = await getLibraryDoctrine(slug) }
  catch (err) { toast(humanize(err)); previewing.value = false; dl.set(null) }
}
function open(e: LibraryEntry) { return openSlug(e.slug) }
function closePreview() { selected.value = null; previewing.value = false; dl.set(null) }

async function fork(e: LibraryEntry | LibraryDoctrine) {
  if (!me.value?.active_org) { toast('pick an active org first to fork into'); return }
  busy.value = true
  try {
    const r = await forkLibraryDoctrine(e.slug)
    toast(`forked as "${r.slug}" into ${me.value.active_org_name ?? 'your org'}`)
    closePreview()
    router.push('/procedures')
  } catch (err) { toast(humanize(err)) }
  finally { busy.value = false }
}

async function unpublish(e: LibraryEntry | LibraryDoctrine) {
  if (!await confirmAction({
    title: 'unpublish procedure', danger: true, confirmLabel: 'Unpublish',
    message: `remove "${e.title || e.slug}" from the public library? forks already made are untouched.`,
  })) return
  busy.value = true
  try { await unpublishDoctrine(e.id); toast('unpublished'); closePreview(); await load() }
  catch (err) { toast(humanize(err)) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="content-inner fadein">
    <!-- Preview d'une entrée sélectionnée -->
    <ConsoleCard v-if="selected" :title="selected.title || selected.slug" flush
      :sub="selected.description || undefined">
      <template #actions>
        <Btn kind="mini" @click="closePreview">← Back</Btn>
        <Btn kind="mini" :disabled="busy" @click="fork(selected)">Fork into my org</Btn>
        <Btn v-if="canUnpublish(selected)" kind="danger" :disabled="busy" @click="unpublish(selected)">Unpublish</Btn>
      </template>
      <div class="card-body">
        <div class="dl-meta">
          <span class="dl-author" :class="selected.author_kind">
            {{ selected.author_kind === 'otomata' ? 'Otomata' : selected.author_display || 'private creator' }}
          </span>
          <Tag v-if="selected.category" tone="saffron">{{ selected.category }}</Tag>
          <span class="dim">v{{ selected.version }} · updated {{ fmtDate(selected.updated_at) }}</span>
        </div>
        <div class="dl-body">
          <DoctrineContent :text="selected.body_md" :reg="reg" />
          <ReferencedTools :text="selected.body_md" :reg="reg" />
        </div>
      </div>
    </ConsoleCard>

    <template v-else>
      <ConsoleCard title="procedure library"
        sub="a public marketplace of procedures — published by Otomata or by other teams. preview, then fork into your org.">
        <div class="dl-controls">
          <input v-model="q" class="inp" placeholder="search procedures…" @keyup.enter="load" />
          <div class="chips">
            <button class="chip" :class="{ on: author === 'all' }" @click="author = 'all'; load()">all authors</button>
            <button class="chip" :class="{ on: author === 'otomata' }" @click="author = 'otomata'; load()">Otomata</button>
            <button class="chip" :class="{ on: author === 'org' }" @click="author = 'org'; load()">community</button>
            <span class="chip-sep" />
            <button class="chip" :class="{ on: category === null }" @click="category = null">all topics</button>
            <button v-for="c in categories" :key="c" class="chip"
              :class="{ on: category === c }" @click="category = c">{{ c }}</button>
          </div>
        </div>
      </ConsoleCard>

      <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

      <div v-if="loaded && shown.length" class="grid3">
        <article v-for="e in shown" :key="e.id" class="dl-card" @click="open(e)">
          <div class="dl-card-head">
            <span class="dl-author" :class="e.author_kind">
              {{ e.author_kind === 'otomata' ? 'Otomata' : e.author_display || 'community' }}
            </span>
            <Tag v-if="e.visibility === 'unlisted'" tone="terra">unlisted</Tag>
          </div>
          <div class="dl-title">{{ e.title || e.slug }}</div>
          <p class="dl-desc">{{ e.snippet || e.description || '—' }}</p>
          <div class="dl-foot">
            <Tag v-if="e.category" tone="saffron">{{ e.category }}</Tag>
            <span class="dim" style="margin-left: auto; font-size: 11px">v{{ e.version }}</span>
            <Btn kind="mini" :disabled="busy" @click.stop="fork(e)">Fork</Btn>
          </div>
        </article>
      </div>

      <div v-else-if="loaded && !error" class="state-empty" style="margin-top: 40px">
        <h3>the library is empty here</h3>
        <p>no published procedure matches. publish one from your <a href="#" @click.prevent="router.push('/procedures')">procedures</a> page.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dl-controls { display: flex; flex-direction: column; gap: 12px; }
.dl-controls .inp { width: 100%; max-width: 420px; }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.chip {
  font-size: 12px; padding: 4px 11px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--color-hair); background: var(--color-surface);
  color: var(--color-ink-soft); transition: all var(--t-fast) var(--ease-out);
}
.chip:hover { border-color: var(--color-ink-soft); }
.chip.on { background: var(--color-ink); color: var(--color-bg); border-color: var(--color-ink); }
.chip-sep { width: 1px; height: 18px; background: var(--color-hair); margin: 0 3px; }

.dl-card {
  display: flex; flex-direction: column; gap: 9px; padding: 16px; cursor: pointer;
  border: 1px solid var(--color-hair); border-radius: 12px; background: var(--color-paper);
  transition: border-color var(--t-fast) var(--ease-out);
}
.dl-card:hover { border-color: var(--color-ink-soft); }
.dl-card-head { display: flex; align-items: center; gap: 8px; }
.dl-title { font-weight: 600; font-size: 14.5px; line-height: 1.25; }
.dl-desc {
  font-size: 12.5px; line-height: 1.5; color: var(--color-ink-soft); margin: 0; flex: 1;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.dl-foot { display: flex; align-items: center; gap: 8px; }

.dl-author {
  font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
  text-transform: uppercase; padding: 2.5px 9px; border-radius: 999px;
}
.dl-author.otomata { background: var(--color-ink); color: var(--color-bg); }
.dl-author.org { background: var(--color-cobalt-soft); color: var(--color-cobalt-ink); }

.dl-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.dl-body {
  max-height: 64vh; overflow-y: auto;
}
.dl-body :deep(.oto-content) { margin-bottom: 18px; }
</style>
