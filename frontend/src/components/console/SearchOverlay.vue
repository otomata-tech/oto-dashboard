<script setup lang="ts">
// Recherche transverse — la POPUP ⌘K (lot 3 Ship 2, plan §6.2). Bâtie sur reka
// Dialog (focus-trap/Esc/restore gratuits — jamais le patron drawer maison).
// Frappe = recherche (debounce 250 ms), rendu partagé `SearchHitList`, ↑↓/Enter,
// « tout voir » → page /search (l'exploration ; la popup = le geste rapide).
// Un seul chemin de code : la même API que MCP `oto_search` (`searchAll`).
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import Icon from '@/components/console/Icon.vue'
import SearchHitList from '@/components/console/SearchHitList.vue'
import { searchAll } from '@/api/console'
import { useScopedLink } from '@/composables/useScopedLink'
import { flattenHits, hitPath } from '@/lib/searchNav'
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
const flat = computed(() => flattenHits(hits.value))   // MÊME ordre que l'affichage groupé

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

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(active.value + 1, flat.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(active.value - 1, 0) }
  else if (e.key === 'Enter' && flat.value[active.value]) { e.preventDefault(); openHit(flat.value[active.value]!) }
}

function openHit(h: SearchHit) {
  emit('update:open', false)
  void router.push(scoped(hitPath(h)))
}
function openAll() {
  const query = q.value.trim()
  emit('update:open', false)
  void router.push(scoped(`/search?q=${encodeURIComponent(query)}`))
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

      <div v-if="hits.length" class="so-results">
        <SearchHitList :hits="hits" :active="active"
          @open="openHit" @hover="(i) => active = i" />
        <button class="so-all" @click="openAll">tout voir sur la page de recherche →</button>
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
.so-all { display: block; width: 100%; text-align: left; padding: 9px 10px; margin-top: 4px; border: none; background: none;
  cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; color: var(--color-cobalt-ink); border-radius: var(--radius-md); }
.so-all:hover { background: var(--color-paper-2); }
.so-empty { padding: 22px 16px; font-size: 13px; color: var(--color-ink-soft); }
.so-empty.dim { color: var(--color-faint); }
.so-foot { padding: 8px 16px; border-top: 1px solid var(--color-hair-soft); font-size: 10px; color: var(--color-faint); }
</style>
