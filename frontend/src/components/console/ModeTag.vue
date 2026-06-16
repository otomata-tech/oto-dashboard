<script setup lang="ts">
import Tag from './Tag.vue'
import type { ConnectorMode } from '@/lib/consoleTypes'

defineProps<{ mode: ConnectorMode }>()
</script>

<template>
  <Tag v-if="mode === 'user'" tone="olive">your key</Tag>
  <Tag v-else-if="mode === 'group'" tone="cobalt">team key</Tag>
  <Tag v-else-if="mode === 'org'" tone="cobalt">org key</Tag>
  <Tag v-else-if="mode === 'platform'" tone="saffron">platform</Tag>
  <Tag v-else>not set</Tag>
</template>
