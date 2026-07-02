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

const ctx = ref<AgentContext | null>(null)
const doctrine = computed(() => ctx.value?.doctrine ?? null)
const hasOrgReadme = computed(() => !!doctrine.value?.doctrine?.trim())
const tools = computed(() => ctx.value?.tools ?? null)

onMounted(async () => {
  try { ctx.value = await getAgentContext() } catch { /* best-effort */ }
})
</script>

<template>
  <ConsoleCard title="ce que voit ton agent"
    sub="le contexte qu'oto injecte à ton Claude à chaque session — instructions, readme, outils visibles.">
    <template #actions>
      <RouterLink class="linklike" to="/context">ouvrir →</RouterLink>
    </template>
    <div v-if="ctx" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center">
      <Tag :tone="doctrine?.org ? 'olive' : undefined">{{ doctrine?.org || 'aucune org active' }}</Tag>
      <Tag :tone="hasOrgReadme ? 'olive' : undefined">readme org · {{ hasOrgReadme ? 'défini' : 'vide' }}</Tag>
      <Tag v-if="doctrine?.group" tone="saffron">équipe : {{ doctrine.group }}</Tag>
      <Tag tone="cobalt">{{ (doctrine?.doctrines?.length ?? 0) }} procédure(s)</Tag>
      <Tag v-if="tools?.available" tone="olive">{{ tools.total_visible }} outils visibles</Tag>
    </div>
    <p v-else class="helptext">contexte indisponible pour le moment.</p>
  </ConsoleCard>
</template>
