<script setup lang="ts">
// Recherche transverse — la POPUP ⌘K (lot 3 Ship 2, plan §6.2). Bâtie sur reka
// Dialog (focus-trap/Esc/restore gratuits — jamais le patron drawer maison).
// Frappe = recherche (debounce 250 ms), hits groupés par famille, ↑↓/Enter.
// Deux anatomies : hit PAGE riche (titre + fil + chapô + passage surligné) vs
// hit CONTENEUR compact (jeton de type mono + nom). Un seul chemin de code :
// la même API que MCP `oto_search` (`searchAll`).
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DOMPurify from 'dompurify'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import Icon from '@/components/console/Icon.vue'
import { searchAll } from '@/api/console'
import { useScopedLink } from '@/composables/useScopedLink'
import type { SearchHit } from '@/types/api'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()
const router = useRouter()
const { scoped } = useScopedLink()

const q = ref('')
const hits = ref<SearchHit[]>([])
const hint = ref<string | null>(null)
const loading = ref(false)
const active = ref(0)

let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0
watch(q, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(run, 250)
})
watch(() => props.open, (o) => {
  if (o) { q.value = ''; hits.value = []; hint.value = null; active.value = 0 }
})

async function run() {
  const query = q.value.trim()
  if (query.length < 2) { hits.value = []; hint.value = null; return }
  const my = ++seq
  loading.value = true
  try {
    const out = await searchAll(query, { limit: 20 })
    if (my !== seq) return                    // réponse périmée (frappe plus récente)
    hits.value = out.hits
    hint.value = out.hint ?? null
    active.value = 0
  } catch { /* réseau : l'état vide + le champ suffisent */ }
  finally { if (my === seq) loading.value = false }
}

// Groupes par famille, ordre stable (plan §6.2) ; l'index ↑↓ parcourt à plat.
const FAMILIES: [string, string][] = [
  ['page', 'Pages'], ['brief', 'Projets'], ['tableau', 'Tableaux'],
  ['fichier', 'Fichiers'], ['procedure', 'Procédures'], ['guide', 'Guides'],
  ['connecteur', 'Connecteurs'],
]
const grouped = computed(() => FAMILIES
  .map(([k, label]) => ({ kind: k, label, items: hits.value.filter((h) => h.kind === k) }))
  .filter((g) => g.items.length))
const flat = computed(() => grouped.value.flatMap((g) => g.items))

const TYPE_ICON: Record<string, string> = {
  page: 'book', brief: 'folder', tableau: 'db', fichier: 'file-text',
  procedure: 'doc', guide: 'book', connecteur: 'plug',
}
const isContainer = (h: SearchHit) => ['tableau', 'fichier', 'connecteur'].includes(h.kind)
const safe = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'mark'] })

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(active.value + 1, flat.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(active.value - 1, 0) }
  else if (e.key === 'Enter' && flat.value[active.value]) { e.preventDefault(); openHit(flat.value[active.value]!) }
}

function openHit(h: SearchHit) {
  emit('update:open', false)
  switch (h.kind) {
    case 'page':
      return void router.push(scoped(`/projects/${h.project_id}?doc=${h.ref}`))
    case 'brief':
      return void router.push(scoped(`/projects/${h.ref}`))
    case 'tableau':
      return void router.push(scoped(`/data/${h.ref}`))
    case 'fichier':
      return void router.push(scoped(`/projects/${h.project_id}`))
    case 'procedure':
      return void router.push(scoped(`/procedures?doc=${h.ref}`))
    case 'guide':
      return void router.push(scoped('/context'))
    case 'connecteur':
      return void router.push(scoped(`/connectors?tab=marketplace&connector=${h.ref}`))
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="so" :style="{ maxWidth: '680px' }" @keydown="onKey">
      <DialogTitle class="sr-only">Rechercher</DialogTitle>
      <div class="so-field">
        <Icon name="search" :size="16" class="so-ic" />
        <!-- eslint-disable-next-line vue/no-autofocus — c'est LE geste de la popup -->
        <input v-model="q" class="so-in" placeholder="Chercher une page, un tableau, une procédure…"
          role="combobox" aria-expanded="true" aria-autocomplete="list" autofocus />
        <span v-if="loading" class="so-load">…</span>
      </div>

      <div v-if="grouped.length" class="so-results" role="listbox">
        <template v-for="g in grouped" :key="g.kind">
          <div class="so-fam">{{ g.label }}</div>
          <button v-for="h in g.items" :key="`${h.kind}:${h.ref}`" class="so-hit"
            :class="{ on: flat[active] === h, compact: isContainer(h) }"
            role="option" :aria-selected="flat[active] === h"
            @mouseenter="active = flat.indexOf(h)" @click="openHit(h)">
            <span class="so-type mono"><Icon :name="TYPE_ICON[h.kind] || 'doc'" :size="12" /></span>
            <span class="so-body">
              <span class="so-line">
                <span class="so-title">{{ h.title }}</span>
                <span v-if="h.project_name && h.kind !== 'brief'" class="so-crumb mono">{{ h.project_name }}</span>
              </span>
              <span v-if="h.description" class="so-desc">{{ h.description }}</span>
              <!-- eslint-disable-next-line vue/no-v-html — sanitizé (b/mark seulement) -->
              <span v-if="h.passage" class="so-passage" v-html="safe(h.passage)" />
            </span>
          </button>
        </template>
      </div>
      <p v-else-if="q.trim().length >= 2 && !loading" class="so-empty">
        {{ hint || 'Aucun résultat — reformule avec les mots exacts du contenu.' }}
      </p>
      <p v-else class="so-empty dim">Tape pour chercher dans tes projets, pages, tableaux, procédures…</p>

      <div class="so-foot mono">↵ ouvrir · esc fermer</div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.so { padding: 0; overflow: hidden; }
.so-field { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--color-hair-soft); }
.so-ic { color: var(--color-mute); flex: none; }
.so-in { flex: 1; border: none; outline: none; background: none; font: inherit; font-size: 15px; color: var(--color-ink); }
.so-load { color: var(--color-faint); }
.so-results { max-height: 420px; overflow-y: auto; padding: 6px; }
.so-fam { font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--color-faint); padding: 8px 10px 3px; }
.so-hit { display: flex; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border: none; background: none; cursor: pointer; border-radius: var(--radius-md); font: inherit; }
.so-hit.on { background: var(--color-paper-2); }
.so-type { flex: none; display: inline-flex; align-items: center; color: var(--color-mute); padding-top: 2px; }
.so-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.so-line { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.so-title { font-weight: 600; font-size: 13.5px; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.so-crumb { font-size: 10px; color: var(--color-faint); flex: none; }
.so-desc { font-size: 12px; color: var(--color-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.so-passage { font-size: 12px; color: var(--color-ink-soft); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.so-passage :deep(b), .so-passage :deep(mark) { background: var(--color-saffron-soft); color: var(--color-ink); font-weight: 600; }
.so-empty { padding: 22px 16px; font-size: 13px; color: var(--color-ink-soft); }
.so-empty.dim { color: var(--color-faint); }
.so-foot { padding: 8px 16px; border-top: 1px solid var(--color-hair-soft); font-size: 10px; color: var(--color-faint); }
</style>
