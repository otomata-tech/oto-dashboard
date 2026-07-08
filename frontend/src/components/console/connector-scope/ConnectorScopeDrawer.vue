<script setup lang="ts" generic="R">
// Drawer unifié : construit sur `ConnectorModal` (shell + onglets), rend les panneaux
// selon l'onglet actif et les leviers présents dans l'adaptateur. Généralise
// `ConnectorDrawer` (user) + `OrgConnectorDrawer` (org) — chaque scope n'expose que
// ses onglets/leviers (les autres panneaux ne sont pas montés).
import { computed, ref } from 'vue'
import ConnectorModal from '@/components/console/ConnectorModal.vue'
import ConnectorAvailabilityPanel from './ConnectorAvailabilityPanel.vue'
import ConnectorCredentialPanel from './ConnectorCredentialPanel.vue'
import ConnectorAboutPanel from './ConnectorAboutPanel.vue'
import type { ConnectorScopeAdapter } from './adapter'

const props = defineProps<{ adapter: ConnectorScopeAdapter<R>; row: R }>()
const emit = defineEmits<{ close: [] }>()

const tabs = computed(() => props.adapter.tabs(props.row))
const tab = ref(tabs.value[0]?.key ?? '')
const meta = computed(() => props.adapter.meta(props.row))
</script>

<template>
  <ConnectorModal :label="adapter.label(row)" :logo-url="meta?.logo_url" :publisher="meta?.publisher"
    :tabs="tabs" v-model:tab="tab" @close="emit('close')">
    <!-- onglet principal : disponibilité (si le scope l'a) + credential -->
    <template v-if="tab === 'credential' || tab === 'main'">
      <ConnectorAvailabilityPanel v-if="adapter.availability" :lever="adapter.availability" :row="row" />
      <ConnectorCredentialPanel v-if="adapter.credential" :lever="adapter.credential" :row="row" />
    </template>
    <ConnectorAboutPanel v-else-if="tab === 'about'" :meta="meta" />
  </ConnectorModal>
</template>
