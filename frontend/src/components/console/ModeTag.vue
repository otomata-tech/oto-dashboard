<script setup lang="ts">
import Tag from './Tag.vue'
import type { ConnectorMode } from '@/lib/consoleTypes'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{ mode: ConnectorMode }>()
</script>

<template>
  <Tag v-if="mode === 'user'" tone="olive">{{ t('miscUi.mode.user') }}</Tag>
  <Tag v-else-if="mode === 'group'" tone="cobalt">{{ t('miscUi.mode.group') }}</Tag>
  <Tag v-else-if="mode === 'org'" tone="cobalt">{{ t('miscUi.mode.org') }}</Tag>
  <Tag v-else-if="mode === 'platform'" tone="saffron">{{ t('miscUi.mode.platform') }}</Tag>
  <Tag v-else>{{ t('miscUi.mode.none') }}</Tag>
</template>
