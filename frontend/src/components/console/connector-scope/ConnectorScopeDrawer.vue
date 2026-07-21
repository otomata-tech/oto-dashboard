<script setup lang="ts" generic="R">
// Drawer unifié : construit sur `ConnectorModal` (coquille = panneau latéral). La
// disponibilité (si le scope l'a) est TOUJOURS en tête (levier primaire) ; les autres
// sections s'empilent en ACCORDÉONS (§5, plus d'onglets), 1ʳᵉ ouverte. Généralise
// `ConnectorDrawer` (user) + `OrgConnectorDrawer` (org) — chaque scope n'expose que ses
// sections/leviers (les autres ne sont pas montés).
import { computed } from 'vue'
import ConnectorModal from '@/components/console/ConnectorModal.vue'
import Icon from '@/components/console/Icon.vue'
import ConnectorBadges from '@/components/console/ConnectorBadges.vue'
import ConnectorTransforms from '@/components/console/ConnectorTransforms.vue'
import ConnectorEmail from '@/components/console/ConnectorEmail.vue'
import ConnectorAvailabilityPanel from './ConnectorAvailabilityPanel.vue'
import ConnectorCredentialPanel from './ConnectorCredentialPanel.vue'
import ConnectorAccessPanel from './ConnectorAccessPanel.vue'
import ConnectorPlatformAccessPanel from './ConnectorPlatformAccessPanel.vue'
import ConnectorConnectionPanel from './ConnectorConnectionPanel.vue'
import ConnectorToolsPanel from './ConnectorToolsPanel.vue'
import ConnectorAboutPanel from './ConnectorAboutPanel.vue'
import type { ConnectorScopeAdapter, ConnectionLever, ToolsLever } from './adapter'
import type { MyConnector } from '@/types/api'

const props = defineProps<{ adapter: ConnectorScopeAdapter<R>; row: R }>()
const emit = defineEmits<{ close: [] }>()

const tabs = computed(() => props.adapter.tabs(props.row))
const meta = computed(() => props.adapter.meta(props.row))
</script>

<template>
  <ConnectorModal :label="adapter.label(row)" :logo-url="meta?.logo_url" :publisher="meta?.publisher"
    @close="emit('close')">
    <template #tags><ConnectorBadges :meta="meta" /></template>

    <!-- disponibilité : levier primaire, toujours visible en tête (hors accordéon) -->
    <ConnectorAvailabilityPanel v-if="adapter.availability" :lever="adapter.availability" :row="row" />

    <!-- sections en ACCORDÉONS (§5 : accordéons + drill-in) — la 1ʳᵉ ouverte par défaut -->
    <details v-for="(t, i) in tabs" :key="t.key" class="csd-acc" :open="i === 0">
      <summary class="csd-acc-hd">
        <Icon name="chevd" :size="13" class="csd-acc-chev" />
        <span class="csd-acc-label">{{ t.label }}</span>
        <span v-if="t.badge" class="csd-acc-badge">{{ t.badge }}</span>
      </summary>
      <div class="csd-acc-body">
        <ConnectorCredentialPanel v-if="(t.key === 'main' || t.key === 'credential') && adapter.credential"
          :lever="adapter.credential" :row="row" />
        <ConnectorConnectionPanel v-else-if="t.key === 'connection' && adapter.connection"
          :lever="(adapter.connection as unknown as ConnectionLever<MyConnector>)" :connector="(row as unknown as MyConnector)" />
        <ConnectorToolsPanel v-else-if="t.key === 'tools' && adapter.tools"
          :lever="(adapter.tools as unknown as ToolsLever<MyConnector>)" :row="(row as unknown as MyConnector)" />
        <ConnectorAccessPanel v-else-if="t.key === 'access' && adapter.access" :lever="adapter.access" :row="row" />
        <ConnectorPlatformAccessPanel v-else-if="t.key === 'access' && adapter.platformAccess"
          :lever="adapter.platformAccess" :row="row" />
        <div v-else-if="t.key === 'redaction' && adapter.redaction" class="csd-pad">
          <ConnectorTransforms v-bind="adapter.redaction.props(row)" @changed="adapter.redaction.onChanged()" />
        </div>
        <div v-else-if="t.key === 'email' && adapter.email" class="csd-pad">
          <ConnectorEmail v-bind="adapter.email.props(row)" @changed="adapter.email.onChanged()" />
        </div>
        <ConnectorAboutPanel v-else-if="t.key === 'about'" :meta="meta" />
      </div>
    </details>
  </ConnectorModal>
</template>

<style scoped>
.csd-pad { padding: 16px 20px; }

/* Accordéons (§5) : un <details> par section, en-tête cliquable, chevron qui pivote. */
.csd-acc { border-top: 1px solid var(--color-hair); }
.csd-acc-hd { display: flex; align-items: center; gap: 8px; padding: 12px 20px; cursor: pointer;
  list-style: none; font-weight: 600; font-size: 13px; color: var(--color-ink); user-select: none; }
.csd-acc-hd::-webkit-details-marker { display: none; }
.csd-acc-hd:hover { background: var(--color-paper-2); }
.csd-acc-chev { flex: none; color: var(--color-mute); transition: transform var(--t-fast); }
.csd-acc[open] .csd-acc-chev { transform: rotate(180deg); }
.csd-acc-label { flex: 1; }
.csd-acc-badge { color: var(--color-faint); font-weight: 500; }
</style>
