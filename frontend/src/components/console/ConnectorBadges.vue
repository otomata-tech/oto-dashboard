<script setup lang="ts">
// Rangée CANONIQUE de badges d'un connecteur — le même vocabulaire sur toutes les
// surfaces (cartes user/org/plateforme, tuiles marketplace/partagés, fiche détail).
// Un axe = une couleur, partout : catégorie=ink, méthode d'auth=cobalt,
// fédéré=saffron, gratuit=olive, grant-only=pill bordée. Dérivée du registre
// (ConnectorMeta) ; sans meta (catalogue pas encore chargé) → rien.
import Tag from './Tag.vue'
import { authChip } from '@/lib/connectorAuth'
import type { ConnectorMeta } from '@/types/api'

withDefaults(defineProps<{
  meta?: ConnectorMeta | null
  showAuth?: boolean   // couper la chip d'auth quand la surface l'explique déjà à côté
}>(), { showAuth: true })
</script>

<template>
  <template v-if="meta">
    <Tag v-if="meta.category" tone="ink">{{ meta.category }}</Tag>
    <Tag v-if="showAuth" tone="cobalt">{{ authChip(meta.auth) }}</Tag>
    <Tag v-if="meta.family === 'federated'" tone="saffron"
      title="mcp fédéré — login délégué, outils proxifiés sous gouvernance oto">fédéré</Tag>
    <Tag v-if="meta.free_tier" tone="olive"
      :title="`clé plateforme oto offerte — ${meta.free_tier.daily_quota}/jour gratuits par utilisateur, sans poser ta clé`">
      gratuit · {{ meta.free_tier.daily_quota }}/j</Tag>
    <span v-if="meta.availability === 'platform_granted'" class="cb-flag"
      title="visible seulement pour les orgs à qui la plateforme l'a accordé">grant-only</span>
  </template>
</template>

<style scoped>
.cb-flag {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2.5px 8px; border-radius: 999px;
  border: 1px solid var(--color-hair); color: var(--color-mute); white-space: nowrap;
}
</style>
