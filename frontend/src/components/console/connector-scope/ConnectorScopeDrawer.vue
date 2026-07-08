<script setup lang="ts" generic="R">
// Drawer unifié : construit sur `ConnectorModal` (shell + onglets). La disponibilité (si
// le scope l'a) est TOUJOURS en tête (levier primaire) ; le corps sous les onglets rend
// le panneau du levier actif. Généralise `ConnectorDrawer` (user) + `OrgConnectorDrawer`
// (org) — chaque scope n'expose que ses onglets/leviers (les autres ne sont pas montés).
import { computed, ref } from 'vue'
import ConnectorModal from '@/components/console/ConnectorModal.vue'
import ConnectorBadges from '@/components/console/ConnectorBadges.vue'
import ConnectorTransforms from '@/components/console/ConnectorTransforms.vue'
import ConnectorEmail from '@/components/console/ConnectorEmail.vue'
import ConnectorAvailabilityPanel from './ConnectorAvailabilityPanel.vue'
import ConnectorCredentialPanel from './ConnectorCredentialPanel.vue'
import ConnectorAccessPanel from './ConnectorAccessPanel.vue'
import ConnectorConnectionPanel from './ConnectorConnectionPanel.vue'
import ConnectorToolsPanel from './ConnectorToolsPanel.vue'
import ConnectorAboutPanel from './ConnectorAboutPanel.vue'
import type { ConnectorScopeAdapter, ConnectionLever, ToolsLever } from './adapter'
import type { MyConnector } from '@/types/api'

const props = defineProps<{ adapter: ConnectorScopeAdapter<R>; row: R }>()
const emit = defineEmits<{ close: [] }>()

const tabs = computed(() => props.adapter.tabs(props.row))
const tab = ref(tabs.value[0]?.key ?? '')
const meta = computed(() => props.adapter.meta(props.row))
</script>

<template>
  <ConnectorModal :label="adapter.label(row)" :logo-url="meta?.logo_url" :publisher="meta?.publisher"
    :tabs="tabs" v-model:tab="tab" @close="emit('close')">
    <template #tags><ConnectorBadges :meta="meta" /></template>

    <!-- disponibilité : toujours en tête si le scope l'a (levier primaire) -->
    <ConnectorAvailabilityPanel v-if="adapter.availability" :lever="adapter.availability" :row="row" />

    <!-- contenu par onglet -->
    <ConnectorCredentialPanel v-if="(tab === 'main' || tab === 'credential') && adapter.credential"
      :lever="adapter.credential" :row="row" />
    <ConnectorConnectionPanel v-else-if="tab === 'connection' && adapter.connection"
      :lever="(adapter.connection as unknown as ConnectionLever<MyConnector>)" :connector="(row as unknown as MyConnector)" />
    <ConnectorToolsPanel v-else-if="tab === 'tools' && adapter.tools"
      :lever="(adapter.tools as unknown as ToolsLever<MyConnector>)" :row="(row as unknown as MyConnector)" />
    <ConnectorAccessPanel v-else-if="tab === 'access' && adapter.access" :lever="adapter.access" :row="row" />
    <div v-else-if="tab === 'redaction' && adapter.redaction" class="csd-pad">
      <ConnectorTransforms v-bind="adapter.redaction.props(row)" @changed="adapter.redaction.onChanged()" />
    </div>
    <div v-else-if="tab === 'email' && adapter.email" class="csd-pad">
      <ConnectorEmail v-bind="adapter.email.props(row)" @changed="adapter.email.onChanged()" />
    </div>
    <ConnectorAboutPanel v-else-if="tab === 'about'" :meta="meta" />
  </ConnectorModal>
</template>

<style scoped>
.csd-pad { padding: 16px 20px; }
</style>
