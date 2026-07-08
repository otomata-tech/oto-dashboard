<script setup lang="ts">
// Bibliothèque de connecteurs — catalogue navigable + FICHE DÉTAIL deep-linkée
// (?connector=<name>, coexiste avec ?tab=). La grille répond à « qu'est-ce qui
// existe ? » (description, catégorie, méthode d'auth, nb d'outils) ; la fiche
// répond à « qu'est-ce que ça fait exactement, avec quels outils, et comment ça
// se configure ? » (description + registre d'outils résolu + config credential +
// doc how-to complète). La connexion d'un credential reste sur /connectors.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import CategoryChips from '@/components/console/CategoryChips.vue'
import ConnectorCardShell from '@/components/console/ConnectorCardShell.vue'
import ConnectorTileBody from '@/components/console/ConnectorTileBody.vue'
import ConnectorDetail from '@/components/console/library/ConnectorDetail.vue'
import { useDeepLink } from '@/composables/useDeepLink'
import { getMyConnectors, getToolRegistry, selectConnector } from '@/api/console'
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

      <!-- Tuiles = MÊME shell que les cartes user/org/plateforme (ADR 0024 §3),
           en variante grille (clickable + fill) ; badges canoniques partagés. -->
      <div v-if="loaded && filtered.length" class="grid3">
        <ConnectorCardShell v-for="c in filtered" :key="c.name"
          :label="c.label" :logo-url="c.logo_url" :subtitle="c.publisher"
          clickable fill @open="open(c)">
          <ConnectorTileBody :description="c.description || c.help" :meta="c" clamp>
            <template #footer>
              <span class="lib-count dim">
                {{ toolsOf(c).length ? `${toolsOf(c).length} outils` : c.namespaces.join(' ') }}
              </span>
              <div class="lib-actions">
                <span class="lib-more">détails →</span>
                <Btn v-if="c.state === 'not_selected'" kind="mini" :disabled="busy === c.name"
                  @click.stop="install(c)">
                  {{ busy === c.name ? '…' : 'Install' }}
                </Btn>
                <RouterLink v-else to="/connectors" class="lib-installed" @click.stop>installed →</RouterLink>
              </div>
            </template>
          </ConnectorTileBody>
        </ConnectorCardShell>
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

/* Chrome de tuile → ConnectorCardShell ; desc+badges+pied → ConnectorTileBody.
   Ici : seulement le contenu propre du pied (compteur + actions install). */
.lib-count { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lib-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.lib-more { font-size: 11px; color: var(--color-faint); }
.lib-installed {
  font-size: 12px; font-weight: 600; color: var(--color-olive); text-decoration: none; white-space: nowrap;
}
</style>
