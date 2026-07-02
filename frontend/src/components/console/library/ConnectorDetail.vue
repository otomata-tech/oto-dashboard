<script setup lang="ts">
// Fiche DÉTAIL d'un connecteur (library, deep-link ?connector=<name>) — la page
// de découverte complète : ce qu'il fait (description + doc), ses OUTILS (registre
// résolu, nom + description), sa CONFIG (méthode d'auth, champs de credential,
// qui peut fournir la clé). Lecture seule + install ; la gestion (poser la clé,
// toggles d'outils) reste dans « mes connecteurs ».
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import ConnectorBadges from '@/components/console/ConnectorBadges.vue'
import DocSections from '@/components/console/DocSections.vue'
import { authExplain, authModesExplain } from '@/lib/connectorAuth'
import type { DocSection, MyConnector, ToolRegistryEntry } from '@/types/api'

const props = defineProps<{
  connector: MyConnector
  tools: ToolRegistryEntry[]      // outils du connecteur (registre résolu, ADR 0014)
  busy: boolean
}>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'install'): void }>()

const c = computed(() => props.connector)
const monogram = computed(() => (c.value.label || c.value.name).charAt(0).toUpperCase())

// Doc « how-to » complète, ordonnée pour la découverte : d'abord ce que ça fait,
// puis ce qu'il faut préparer, puis la mise en route, puis les notes.
const DOC_ORDER: Record<DocSection['kind'], number> = { usage: 0, prerequisite: 1, setup: 2, note: 3 }
const docs = computed(() =>
  [...(c.value.doc_sections ?? [])].sort((a, b) => DOC_ORDER[a.kind] - DOC_ORDER[b.kind]))

const sortedTools = computed(() =>
  [...props.tools].sort((a, b) => a.name.localeCompare(b.name)))
const keyProviders = computed(() => authModesExplain(c.value))
const fields = computed(() => c.value.credential_fields ?? [])
const installed = computed(() => c.value.state !== 'not_selected')
</script>

<template>
  <ConsoleCard flush :title="c.label" :sub="c.help || undefined">
    <template #actions>
      <Btn kind="mini" @click="emit('back')">← back</Btn>
      <a v-if="c.href" :href="c.href" target="_blank" rel="noopener" class="cd-site">↗ site éditeur</a>
      <Btn v-if="!installed" kind="mini" :disabled="busy" @click="emit('install')">
        {{ busy ? '…' : 'installer' }}
      </Btn>
      <RouterLink v-else to="/connectors" class="cd-installed">installé →</RouterLink>
    </template>

    <div class="card-body">
      <!-- identité : logo + éditeur + axes de lecture -->
      <div class="cd-meta">
        <div class="cd-logo">
          <img v-if="c.logo_url" :src="c.logo_url" :alt="c.label" loading="lazy" />
          <span v-else class="cd-mono">{{ monogram }}</span>
        </div>
        <span class="cd-pub">{{ c.publisher }}</span>
        <!-- Badges CANONIQUES — même vocabulaire que les cartes des 3 projections. -->
        <ConnectorBadges :meta="c" />
      </div>

      <!-- ce que fait le connecteur -->
      <p class="cd-desc">{{ c.description || c.help }}</p>

      <div class="cd-cols">
        <!-- connexion & configuration -->
        <section class="cd-panel">
          <h4>connexion & configuration</h4>
          <p class="cd-auth">{{ authExplain(c) }}</p>
          <div v-if="fields.length" class="cd-fields">
            <div v-for="f in fields" :key="f.name" class="cd-field">
              <div class="cd-field-head">
                <span class="cd-field-label">{{ f.label }}</span>
                <code class="mono cd-field-name">{{ f.name }}</code>
                <span class="cd-field-kind">{{ f.secret ? 'secret' : 'config' }}</span>
              </div>
              <p v-if="f.help" class="cd-field-help">{{ f.help }}</p>
            </div>
          </div>
          <template v-if="keyProviders.length">
            <div class="cd-sub">la clé peut venir de :</div>
            <ul class="cd-modes">
              <li v-for="m in keyProviders" :key="m">{{ m }}</li>
            </ul>
          </template>
          <p v-if="c.personal_session" class="cd-note">
            session strictement personnelle — jamais partagée avec ton org.
          </p>
        </section>

        <!-- outils exposés à l'agent -->
        <section class="cd-panel">
          <h4>outils <span class="dim">{{ sortedTools.length || '' }}</span></h4>
          <div v-if="sortedTools.length" class="cd-tools">
            <div v-for="t in sortedTools" :key="t.name" class="cd-tool">
              <code class="mono cd-tool-name">{{ t.name }}</code>
              <span class="cd-tool-desc">{{ t.description || '—' }}</span>
            </div>
          </div>
          <p v-else class="cd-note">
            les outils de ce connecteur ne sont pas chargés sur cette instance
            (namespaces : <code class="mono">{{ c.namespaces.join(', ') }}</code>).
          </p>
        </section>
      </div>

      <!-- doc « how-to » complète (usage, prérequis, setup, notes) -->
      <section v-if="docs.length" class="cd-panel cd-docs">
        <h4>guide</h4>
        <DocSections :sections="docs" />
      </section>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.cd-site { font-size: 11.5px; color: var(--color-faint); text-decoration: none; align-self: center; }
.cd-site:hover { color: var(--color-ink-soft); }
.cd-installed { font-size: 12px; font-weight: 600; color: var(--color-olive); text-decoration: none; align-self: center; white-space: nowrap; }

.cd-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.cd-logo {
  width: 34px; height: 34px; border-radius: 8px; overflow: hidden; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-hair); background: var(--color-surface);
}
.cd-logo img { width: 100%; height: 100%; object-fit: contain; }
.cd-mono { font-family: var(--font-mono); font-weight: 700; font-size: 15px; color: var(--color-ink-soft); }
.cd-pub { font-size: 12px; color: var(--color-mute); margin-right: 4px; }

.cd-desc { font-size: 13.5px; line-height: 1.6; color: var(--color-ink-soft); margin: 0 0 16px; max-width: 72ch; }

.cd-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
.cd-panel {
  border: 1px solid var(--color-hair-soft); border-radius: 10px; padding: 13px 15px;
  background: var(--color-surface);
}
.cd-panel h4 {
  margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
  text-transform: uppercase; color: var(--color-faint);
}
.cd-auth { font-size: 12.5px; line-height: 1.55; color: var(--color-ink-soft); margin: 0 0 10px; }

.cd-fields { display: flex; flex-direction: column; gap: 7px; margin-bottom: 10px; }
.cd-field { border-bottom: 1px dashed var(--color-hair-soft); padding-bottom: 6px; }
.cd-field:last-child { border-bottom: 0; }
.cd-field-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.cd-field-label { font-size: 12.5px; font-weight: 600; }
.cd-field-name { font-size: 11px; color: var(--color-faint); }
.cd-field-kind {
  margin-left: auto; font-family: var(--font-mono); font-size: 9.5px; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--color-mute); border: 1px solid var(--color-hair);
  border-radius: 999px; padding: 1.5px 7px;
}
.cd-field-help { margin: 3px 0 0; font-size: 11.5px; color: var(--color-mute); }

.cd-sub { font-size: 11.5px; font-weight: 600; color: var(--color-ink-soft); margin-bottom: 4px; }
.cd-modes { margin: 0; padding-left: 16px; font-size: 12px; color: var(--color-mute); line-height: 1.6; }
.cd-note { font-size: 11.5px; color: var(--color-mute); margin: 8px 0 0; }

.cd-tools { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; }
.cd-tool { display: flex; flex-direction: column; gap: 1px; padding: 4px 0; border-bottom: 1px solid var(--color-hair-soft); }
.cd-tool:last-child { border-bottom: 0; }
.cd-tool-name { font-size: 12px; color: var(--color-ink); }
.cd-tool-desc { font-size: 11.5px; line-height: 1.45; color: var(--color-mute); }

.cd-docs { margin-top: 14px; }
</style>
