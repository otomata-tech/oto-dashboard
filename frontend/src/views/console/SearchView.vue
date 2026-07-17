<script setup lang="ts">
// Page /search — l'EXPLORATION de la recherche transverse (lot 3 Ship 2, §6.2) :
// la popup ⌘K est le geste rapide, cette page est le lien partageable (`?q=`,
// back-button) avec filtres de type post-résultats. Même chemin de code que la
// popup et MCP oto_search (`searchAll` + `SearchHitList`).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/console/Icon.vue'
import SearchHitList from '@/components/console/SearchHitList.vue'
import { searchAll } from '@/api/console'
import { useScopedLink } from '@/composables/useScopedLink'
import { humanize } from '@/lib/errors'
import { FAMILIES, hitPath } from '@/lib/searchNav'
import type { SearchHit } from '@/types/api'

const route = useRoute()
const router = useRouter()
const { scoped } = useScopedLink()

const q = ref(String(route.query.q ?? ''))
const hits = ref<SearchHit[]>([])
const hint = ref<string | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const kindFilter = ref<string | null>(null)   // filtre post-résultats (chip)

let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0
watch(q, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(run, 250)
  // Miroir URL (replace) : refresh et partage de lien conservent la requête.
  const query = q.value.trim()
  if ((route.query.q ?? '') !== query)
    void router.replace({ query: { ...route.query, q: query || undefined } })
})
watch(() => route.query.q, (v) => {
  const s = String(v ?? '')
  if (s !== q.value) q.value = s              // back-button / lien entrant
})

async function run() {
  const query = q.value.trim()
  if (query.length < 2) { hits.value = []; hint.value = null; error.value = null; return }
  const my = ++seq
  loading.value = true
  error.value = null
  try {
    const out = await searchAll(query, { limit: 50 })
    if (my !== seq) return
    hits.value = out.hits
    hint.value = out.hint ?? null
    kindFilter.value = null
  } catch (e) {
    if (my === seq) error.value = humanize(e)
  } finally { if (my === seq) loading.value = false }
}
onMounted(() => { if (q.value.trim().length >= 2) void run() })

// Chips de type : dérivées des hits présents (jamais un filtre inerte).
const kindsPresent = computed(() => FAMILIES.filter(([k]) => hits.value.some((h) => h.kind === k)))
const shown = computed(() => kindFilter.value
  ? hits.value.filter((h) => h.kind === kindFilter.value) : hits.value)

function openHit(h: SearchHit) { void router.push(scoped(hitPath(h))) }
</script>

<template>
  <div class="content-inner">
    <div class="card sv">
      <div class="sv-field">
        <Icon name="search" :size="16" class="sv-ic" />
        <input v-model="q" class="sv-in" placeholder="Chercher dans tes projets, pages, tableaux, procédures…" />
      </div>

      <div v-if="kindsPresent.length > 1" class="sv-chips">
        <button class="sv-chip" :class="{ on: kindFilter === null }" @click="kindFilter = null">tout</button>
        <button v-for="[k, label] in kindsPresent" :key="k" class="sv-chip"
          :class="{ on: kindFilter === k }" @click="kindFilter = kindFilter === k ? null : k">
          {{ label.toLowerCase() }}
        </button>
      </div>

      <div v-if="loading" class="sv-state dim">recherche…</div>
      <div v-else-if="error" class="state-error">
        {{ error }} <button class="sv-retry" @click="run">réessayer</button>
      </div>
      <SearchHitList v-else-if="shown.length" :hits="shown" @open="openHit" />
      <div v-else-if="q.trim().length >= 2" class="sv-state">
        {{ hint || 'Aucun résultat — reformule avec les mots exacts du contenu.' }}
      </div>
      <div v-else class="sv-state dim">
        Tape ta recherche — ou ⌘K depuis n'importe quel écran.
      </div>
    </div>
  </div>
</template>

<style scoped>
.sv { padding: 10px 12px 14px; }
.sv-field { display: flex; align-items: center; gap: 10px; padding: 8px 6px 12px; border-bottom: 1px solid var(--color-hair-soft); }
.sv-ic { color: var(--color-mute); flex: none; }
.sv-in { flex: 1; border: none; outline: none; background: none; font: inherit; font-size: 15px; color: var(--color-ink); }
.sv-chips { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 6px 4px; }
.sv-chip { border: 1px solid var(--color-hair); border-radius: var(--radius-pill); background: var(--color-surface);
  padding: 3px 11px; font: inherit; font-size: 11.5px; color: var(--color-mute); cursor: pointer; }
.sv-chip.on { border-color: var(--color-ink); color: var(--color-ink); font-weight: 600; }
.sv-state { padding: 22px 8px; font-size: 13px; color: var(--color-ink-soft); }
.sv-state.dim { color: var(--color-faint); }
.sv-retry { border: none; background: none; font: inherit; color: var(--color-cobalt-ink); font-weight: 600; cursor: pointer; }
</style>
