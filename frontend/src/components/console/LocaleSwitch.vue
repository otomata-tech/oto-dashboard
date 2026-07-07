<script setup lang="ts">
// Bascule de langue EN/FR — réutilise le segmented `SubTabs` (déjà lowercase, voix
// jeton du DS). La locale active + la persistance vivent dans `lib/i18n`.
import SubTabs from './SubTabs.vue'
import { locale, setLocale } from '@/lib/i18n'
import type { Locale } from '@/types/api'

const tabs = [
  { key: 'en', label: 'en' },
  { key: 'fr', label: 'fr' },
]
</script>

<template>
  <SubTabs :tabs="tabs" :model-value="locale" @update:model-value="(k: string) => setLocale(k as Locale)" />
</template>

<style scoped>
/* Inline (popin/carte) : neutralise la marge de bas propre au segmented de page. */
:deep(.subtabs) { margin-bottom: 0; }
</style>
