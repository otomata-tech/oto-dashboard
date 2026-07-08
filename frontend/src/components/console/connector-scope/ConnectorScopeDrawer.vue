<script setup lang="ts" generic="R">
// Drawer unifié : construit sur `ConnectorModal` (shell + onglets), rend les panneaux
// selon l'onglet actif et les leviers présents dans l'adaptateur. Généralise
// `ConnectorDrawer` (user) + `OrgConnectorDrawer` (org) — chaque scope n'expose que
// ses onglets/leviers (les autres panneaux ne sont pas montés).
import { computed, ref } from 'vue'
import ConnectorModal from '@/components/console/ConnectorModal.vue'
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
    <!-- onglet principal : credential (+ availability quand le scope l'a, ajouté plus tard) -->
    <template v-if="tab === 'credential' || tab === 'main'">
      <ConnectorCredentialPanel v-if="adapter.credential" :lever="adapter.credential" :row="row" />
    </template>
    <ConnectorAboutPanel v-else-if="tab === 'about'" :meta="meta" />
  </ConnectorModal>
</template>
