<script setup lang="ts">
// Cellule identité d'UN connecteur (« le connecteur ») — Avatar carré + nom (+ tag
// « recommended ») + sous-titre (éditeur · catégorie). Réutilisée par toutes les surfaces
// de liste (user/org/équipe) dans le slot #row de ConnectorList : fin de la duplication
// du bloc identité `.cv-name`/`.cv-pub`. Source préférée = `meta` (ConnectorMeta) ; chaque
// champ peut être surchargé (l'org passe `label` car son meta peut être absent).
import { computed } from 'vue'
import Avatar from './Avatar.vue'
import type { ConnectorMeta } from '@/types/api'

const props = withDefaults(defineProps<{
  meta?: ConnectorMeta | null
  label?: string
  logoUrl?: string | null
  subtitle?: string
  recommended?: boolean
  size?: number
}>(), { size: 32 })

const label = computed(() => props.label ?? props.meta?.label ?? '')
const logoUrl = computed(() => props.logoUrl ?? props.meta?.logo_url ?? null)
const subtitle = computed(() =>
  props.subtitle ?? [props.meta?.publisher, props.meta?.category].filter(Boolean).join(' · '))
</script>

<template>
  <div class="ci">
    <Avatar :src="logoUrl" :name="label" :size="size" shape="square" />
    <div class="ci-txt">
      <div class="ci-name">{{ label }}<span v-if="recommended" class="tag saffron ci-reco">recommended</span></div>
      <div class="ci-sub">{{ subtitle }}</div>
    </div>
  </div>
</template>

<style scoped>
.ci { display: flex; align-items: center; gap: 11px; }
.ci-txt { min-width: 0; }
.ci-name { font-weight: 600; font-size: 13px; color: var(--color-ink); display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.ci-reco { font-size: 8.5px; padding: 1.5px 6px; }
.ci-sub { font-size: 11px; color: var(--color-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
