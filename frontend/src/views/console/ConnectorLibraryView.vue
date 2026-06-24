<script setup lang="ts">
// Bibliothèque de connecteurs — catalogue navigable (logo éditeur, recherche,
// filtres par catégorie / éditeur). Surface de DÉCOUVERTE ; la connexion d'un
// credential reste sur /connectors. Données = GET /api/connectors (même
// source que la vitrine, qui consomme l'anonyme).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import DocSections from '@/components/console/DocSections.vue'
import { getMyConnectors, selectConnector } from '@/api/console'
import type { MyConnector } from '@/types/api'
import { humanize } from '@/lib/errors'

const catalog = ref<MyConnector[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const busy = ref<string | null>(null)

const q = ref('')
const category = ref<string | null>(null)

async function load() {
  try { catalog.value = (await getMyConnectors()).connectors }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

// Installer = sélectionner dans son workspace (state → active). Le détail (config
// credential, masquage, désactivation) se gère ensuite dans /connectors.
async function install(c: MyConnector) {
  busy.value = c.name
  try { await selectConnector(c.name); c.state = 'active' }
  catch (e) { error.value = humanize(e) }
  finally { busy.value = null }
}

// Catégories présentes, ordonnées par nb de connecteurs.
const categories = computed(() => {
  const counts = new Map<string, number>()
  for (const c of catalog.value) counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))
})

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return catalog.value.filter((c) => {
    if (category.value && c.category !== category.value) return false
    if (!needle) return true
    return (
      c.label.toLowerCase().includes(needle) ||
      c.name.toLowerCase().includes(needle) ||
      (c.publisher || '').toLowerCase().includes(needle) ||
      (c.help || '').toLowerCase().includes(needle) ||
      c.namespaces.some((ns) => ns.toLowerCase().includes(needle))
    )
  })
})

// Monogramme de repli quand pas de logo (1ʳᵉ lettre du label).
const monogram = (c: MyConnector) => (c.label || c.name).charAt(0).toUpperCase()
// En découverte on ne montre que l'usage (« ce que ça fait ») ; les prérequis/setup
// restent au moment de connecter (carte de connexion).
const usageOf = (c: MyConnector) => (c.doc_sections ?? []).filter((s) => s.kind === 'usage')
const familyTone = (f: string): 'olive' | 'saffron' | 'cobalt' | 'ink' =>
  f === 'open-data' ? 'olive' : f === 'federated' || f === 'bridge' ? 'cobalt' : 'ink'

</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard title="connector library"
      sub="browse every connector oto can drive — search, filter by category, then connect from your workspace.">
      <div class="lib-controls">
        <input v-model="q" class="inp" placeholder="search connectors, publishers, namespaces…" />
        <div class="chips">
          <button class="chip" :class="{ on: category === null }" @click="category = null">all</button>
          <button v-for="c in categories" :key="c.name" class="chip"
            :class="{ on: category === c.name }" @click="category = c.name">
            {{ c.name }} <span class="chip-n">{{ c.n }}</span>
          </button>
        </div>
      </div>
    </ConsoleCard>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div v-if="loaded && filtered.length" class="grid3">
      <article v-for="c in filtered" :key="c.name" class="lib-card">
        <div class="lib-head">
          <div class="lib-logo">
            <img v-if="c.logo_url" :src="c.logo_url" :alt="c.label" loading="lazy" />
            <span v-else class="lib-mono">{{ monogram(c) }}</span>
          </div>
          <div style="min-width: 0; flex: 1">
            <div class="lib-name">{{ c.label }}</div>
            <div class="lib-pub">{{ c.publisher }}</div>
          </div>
        </div>
        <p class="lib-help">{{ c.help || '—' }}</p>
        <DocSections v-if="usageOf(c).length" :sections="usageOf(c)" style="margin: 2px 0 8px" />
        <div class="lib-tags">
          <Tag tone="saffron">{{ c.category }}</Tag>
          <Tag :tone="familyTone(c.family)">{{ c.family }}</Tag>
          <span v-if="c.availability === 'platform_granted'" class="lib-flag">grant-only</span>
        </div>
        <div class="lib-foot">
          <code class="mono lib-ns">{{ c.namespaces.join('  ') }}</code>
          <div class="lib-actions">
            <a v-if="c.href" :href="c.href" target="_blank" rel="noopener" class="lib-doc" @click.stop>↗ doc</a>
            <Btn v-if="c.state === 'not_selected'" kind="mini" :disabled="busy === c.name" @click="install(c)">
              {{ busy === c.name ? '…' : 'install' }}
            </Btn>
            <RouterLink v-else to="/connectors" class="lib-installed">installed →</RouterLink>
          </div>
        </div>
      </article>
    </div>

    <div v-else-if="loaded && !error" class="state-empty" style="margin-top: 40px">
      <h3>no connector matches</h3>
      <p>try a different search or clear the category filter.</p>
    </div>
  </div>
</template>

<style scoped>
.lib-controls { display: flex; flex-direction: column; gap: 12px; }
.lib-controls .inp { width: 100%; max-width: 420px; }
.chips { display: flex; flex-wrap: wrap; gap: 7px; }
.chip {
  font-size: 12px; padding: 4px 11px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--color-hair); background: var(--color-surface);
  color: var(--color-ink-soft); transition: all var(--t-fast) var(--ease-out);
}
.chip:hover { border-color: var(--color-ink-soft); }
.chip.on { background: var(--color-ink); color: var(--color-bg); border-color: var(--color-ink); }
.chip-n { opacity: 0.55; font-variant-numeric: tabular-nums; }

.lib-card {
  display: flex; flex-direction: column; gap: 10px; padding: 16px;
  border: 1px solid var(--color-hair); border-radius: 12px; background: var(--color-paper);
  transition: border-color var(--t-fast) var(--ease-out);
}
.lib-card:hover { border-color: var(--color-ink-soft); }
.lib-head { display: flex; align-items: center; gap: 11px; }
.lib-logo {
  width: 40px; height: 40px; border-radius: 9px; flex: 0 0 auto; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-hair); background: var(--color-surface);
}
.lib-logo img { width: 100%; height: 100%; object-fit: contain; }
.lib-mono { font-family: var(--font-mono); font-weight: 700; font-size: 17px; color: var(--color-ink-soft); }
.lib-name { font-weight: 600; font-size: 14px; line-height: 1.2; }
.lib-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; }
.lib-help { font-size: 12.5px; line-height: 1.5; color: var(--color-ink-soft); margin: 0; flex: 1; }
.lib-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.lib-flag {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2.5px 8px; border-radius: 999px;
  border: 1px solid var(--color-hair); color: var(--color-mute);
}
.lib-foot { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.lib-ns { font-size: 11px; color: var(--color-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.lib-doc { font-size: 11px; color: var(--color-faint); text-decoration: none; }
.lib-doc:hover { color: var(--color-ink-soft); }
.lib-installed {
  font-size: 12px; font-weight: 600; color: var(--color-olive); text-decoration: none; white-space: nowrap;
}
.lib-flag-proposed { border-color: var(--color-olive); color: var(--color-olive); }
</style>
