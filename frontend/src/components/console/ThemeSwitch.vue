<script setup lang="ts">
// Bascule du thème — système / clair / sombre, sur le segmented `SubTabs`, comme la
// langue (`LocaleSwitch`). La préférence et son application vivent dans `lib/theme`.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SubTabs from './SubTabs.vue'
import { setTheme, THEMES, themePref, type ThemePref } from '@/lib/theme'

const { t } = useI18n()
const tabs = computed(() => THEMES.map((k) => ({ key: k, label: t(`theme.${k}`) })))
</script>

<template>
  <SubTabs :tabs="tabs" :model-value="themePref" :aria-label="t('theme.label')"
    @update:model-value="(k: string) => setTheme(k as ThemePref)" />
</template>

<style scoped>
/* Inline (carte) : neutralise la marge de bas propre au segmented de page. */
:deep(.subtabs) { margin-bottom: 0; }
</style>
