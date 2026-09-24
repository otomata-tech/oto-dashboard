<script setup lang="ts">
// Aperçu « ce que voit ton agent » pour l'accueil (B4) — résumé une-ligne du contexte
// qu'oto injecte à chaque session, avec entrée vers la section Context (projection user).
// Dérive du même artefact réel (getAgentContext) ; best-effort (n'échoue pas l'accueil).
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import { getAgentContext } from '@/api/console'
import type { AgentContext } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const ctx = ref<AgentContext | null>(null)
const doctrine = computed(() => ctx.value?.doctrine ?? null)
const hasOrgReadme = computed(() => !!doctrine.value?.doctrine?.trim())
const tools = computed(() => ctx.value?.tools ?? null)

onMounted(async () => {
  try { ctx.value = await getAgentContext() } catch { /* best-effort */ }
})
</script>

<template>
  <ConsoleCard :title="t('contextUi.preview.title')" :sub="t('contextUi.preview.sub')">
    <template #actions>
      <RouterLink class="linklike" to="/context">{{ t('contextUi.preview.open') }}</RouterLink>
    </template>
    <div v-if="ctx" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center">
      <Tag :tone="doctrine?.org ? 'olive' : undefined">{{ doctrine?.org || t('contextUi.noOrg.title') }}</Tag>
      <Tag :tone="hasOrgReadme ? 'olive' : undefined">{{ hasOrgReadme ? t('contextUi.preview.orgReadmeSet') : t('contextUi.preview.orgReadmeEmpty') }}</Tag>
      <Tag v-if="doctrine?.group" tone="saffron">{{ t('contextUi.preview.team', { team: doctrine.group }) }}</Tag>
      <Tag tone="cobalt">{{ t('contextUi.preview.procedures', doctrine?.doctrines?.length ?? 0) }}</Tag>
      <Tag v-if="tools?.available" tone="olive">{{ t('contextUi.preview.tools', tools.total_visible ?? 0) }}</Tag>
    </div>
    <p v-else class="helptext">{{ t('contextUi.preview.unavailable') }}</p>
  </ConsoleCard>
</template>
