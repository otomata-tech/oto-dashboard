<script setup lang="ts">
// Ossature commune des pages du scope Team (/team/*) : ligne d'erreur + garde « aucune
// équipe » (jamais de fallback silencieux) + slot scopé exposant le `detail` NON-NULL de
// l'équipe (narrowing propre pour les cartes filles). Le contenu propre de chaque page
// (membres / connecteurs / readme / procédures) vit dans le slot.
import ConsoleCard from './ConsoleCard.vue'
import type { GroupDetail } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  detail: GroupDetail | null
  loaded: boolean
  error: string | null
  groupId: number | null
}>()
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && groupId == null" :title="t('orgUi.teamScope.none')">
      <div class="helptext">
        {{ t('orgUi.teamScope.help') }}
      </div>
    </ConsoleCard>

    <template v-else-if="detail">
      <slot :detail="detail" />
    </template>
  </div>
</template>
