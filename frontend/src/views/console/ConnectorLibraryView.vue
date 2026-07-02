<script setup lang="ts">
// Bibliothèque de connecteurs — catalogue navigable + FICHE DÉTAIL deep-linkée
// (?connector=<name>, coexiste avec ?tab=). La grille répond à « qu'est-ce qui
// existe ? » (description, catégorie, méthode d'auth, nb d'outils) ; la fiche
// répond à « qu'est-ce que ça fait exactement, avec quels outils, et comment ça
// se configure ? » (description + registre d'outils résolu + config credential +
// doc how-to complète). La connexion d'un credential reste sur /connectors.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import CategoryChips from '@/components/console/CategoryChips.vue'
import ConnectorDetail from '@/components/console/library/ConnectorDetail.vue'
import { useDeepLink } from '@/composables/useDeepLink'
import { getMyConnectors, getToolRegistry, selectConnector } from '@/api/console'
import { authChip } from '@/lib/connectorAuth'
import type { MyConnector, ToolRegistryEntry } from '@/types/api'
import { humanize } from '@/lib/errors'

const catalog = ref<MyConnector[]>([])
const registry = ref<ToolRegistryEntry[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const busy = ref<string | null>(null)

const q = ref('')
const category = ref<string | null>(null)

// Fiche détail portée par ?connector=<name> (lien direct + back/forward).
const selected = ref<MyConnector | null>(null)
const dl = useDeepLink('connector', (name) => {
  if (name) selected.value = catalog.value.find((c) => c.name === name) ?? null
  else selected.value = null
})
function open(c: MyConnector) { selected.value = c; dl.set(c.name) }
function closeDetail() { selected.value = null; dl.set(null) }

async function load() {
  try {
    catalog.value = (await getMyConnectors()).connectors
    // Registre résolu (ADR 0014) : nom + description de chaque outil exposé —
    // la fiche détail et le compte d'outils en dérivent. Optionnel (best-effort).
    try { registry.value = (await getToolRegistry()).tools } catch { registry.value = [] }
    const name = dl.read()
    if (name) selected.value = catalog.value.find((c) => c.name === name) ?? null
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

// Outils d'un connecteur = entrées du registre dont le namespace (1er token
// avant `_`) appartient au connecteur — même dérivation que le backend.
const nsOf = (toolName: string): string => toolName.split('_')[0] ?? toolName
const toolsByConnector = computed(() => {
  const byNs = new Map<string, ToolRegistryEntry[]>()
  for (const t of registry.value) {
    const ns = nsOf(t.name)
    const arr = byNs.get(ns) ?? []
    arr.push(t)
    byNs.set(ns, arr)
  }
  const out = new Map<string, ToolRegistryEntry[]>()
  for (const c of catalog.value) out.set(c.name, c.namespaces.flatMap((ns) => byNs.get(ns) ?? []))
  return out
})
const toolsOf = (c: MyConnector) => toolsByConnector.value.get(c.name) ?? []

// Installer = sélectionner dans son workspace (state → active). Le détail (config
// credential, masquage, désactivation) se gère ensuite dans /connectors.
async function install(c: MyConnector) {
  busy.value = c.name
  try { await selectConnector(c.name); c.state = 'active' }
  catch (e) { error.value = humanize(e) }
  finally { busy.value = null }
}

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
      (c.description || '').toLowerCase().includes(needle) ||
      c.namespaces.some((ns) => ns.toLowerCase().includes(needle)) ||
      toolsOf(c).some((t) => t.name.toLowerCase().includes(needle))
    )
  })
})

// Monogramme de repli quand pas de logo (1ʳᵉ lettre du label).
const monogram = (c: MyConnector) => (c.label || c.name).charAt(0).toUpperCase()
</script>

<template>
  <div class="content-inner fadein">
    <!-- Fiche détail d'un connecteur sélectionné -->
    <ConnectorDetail v-if="selected" :connector="selected" :tools="toolsOf(selected)"
      :busy="busy === selected.name" @back="closeDetail" @install="install(selected)" />

    <template v-else>
      <ConsoleCard title="connector library"
        sub="browse every connector oto can drive — search, open a card for its tools & setup, then install.">
        <div class="lib-controls">
          <input v-model="q" class="inp" placeholder="search connectors, tools, publishers…" />
          <CategoryChips :values="catalog.map((c) => c.category)" v-model="category" />
        </div>
      </ConsoleCard>

      <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

      <div v-if="loaded && filtered.length" class="grid3">
        <article v-for="c in filtered" :key="c.name" class="lib-card" @click="open(c)">
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
          <p class="lib-desc">{{ c.description || c.help || '—' }}</p>
          <div class="lib-tags">
            <Tag tone="saffron">{{ c.category }}</Tag>
            <Tag tone="cobalt">{{ authChip(c.auth) }}</Tag>
            <Tag v-if="c.free_tier" tone="olive">gratuit · {{ c.free_tier.daily_quota }}/j</Tag>
            <span v-if="c.availability === 'platform_granted'" class="lib-flag">grant-only</span>
          </div>
          <div class="lib-foot">
            <span class="lib-count dim">
              {{ toolsOf(c).length ? `${toolsOf(c).length} outils` : c.namespaces.join(' ') }}
            </span>
            <div class="lib-actions">
              <span class="lib-more">détails →</span>
              <Btn v-if="c.state === 'not_selected'" kind="mini" :disabled="busy === c.name"
                @click.stop="install(c)">
                {{ busy === c.name ? '…' : 'install' }}
              </Btn>
              <RouterLink v-else to="/connectors" class="lib-installed" @click.stop>installed →</RouterLink>
            </div>
          </div>
        </article>
      </div>

      <div v-else-if="loaded && !error" class="state-empty" style="margin-top: 40px">
        <h3>no connector matches</h3>
        <p>try a different search or clear the category filter.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.lib-controls { display: flex; flex-direction: column; gap: 12px; }
.lib-controls .inp { width: 100%; max-width: 420px; }

.lib-card {
  display: flex; flex-direction: column; gap: 10px; padding: 16px; cursor: pointer;
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
.lib-desc {
  font-size: 12.5px; line-height: 1.5; color: var(--color-ink-soft); margin: 0; flex: 1;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.lib-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.lib-flag {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2.5px 8px; border-radius: 999px;
  border: 1px solid var(--color-hair); color: var(--color-mute);
}
.lib-foot { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.lib-count { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lib-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.lib-more { font-size: 11px; color: var(--color-faint); }
.lib-card:hover .lib-more { color: var(--color-ink-soft); }
.lib-installed {
  font-size: 12px; font-weight: 600; color: var(--color-olive); text-decoration: none; white-space: nowrap;
}
</style>
