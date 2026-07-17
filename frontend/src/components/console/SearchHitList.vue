<script setup lang="ts">
// Liste de hits de recherche (lot 3 Ship 2) — le RENDU partagé popup ⌘K / page
// /search : familles groupées, deux anatomies (page riche : titre + fil + chapô +
// passage surligné sanitizé · conteneur compact), sélection pilotée par le parent
// (`active` = index à plat). Émet `open(hit)` — la navigation vit chez le parent.
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import Icon from '@/components/console/Icon.vue'
import { flattenHits, groupHits } from '@/lib/searchNav'
import type { SearchHit } from '@/types/api'

const props = defineProps<{ hits: SearchHit[]; active?: number }>()
const emit = defineEmits<{ (e: 'open', h: SearchHit): void; (e: 'hover', idx: number): void }>()

const grouped = computed(() => groupHits(props.hits))
const flat = computed(() => flattenHits(props.hits))

const TYPE_ICON: Record<string, string> = {
  page: 'book', brief: 'folder', tableau: 'db', fichier: 'file-text',
  procedure: 'doc', guide: 'book', connecteur: 'plug',
}
const isContainer = (h: SearchHit) => ['tableau', 'fichier', 'connecteur'].includes(h.kind)
const safe = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'mark'] })
</script>

<template>
  <div class="shl" role="listbox">
    <template v-for="g in grouped" :key="g.kind">
      <div class="shl-fam">{{ g.label }}</div>
      <button v-for="h in g.items" :key="`${h.kind}:${h.ref}`" class="shl-hit"
        :class="{ on: active != null && flat[active] === h, compact: isContainer(h) }"
        role="option" :aria-selected="active != null && flat[active] === h"
        @mouseenter="emit('hover', flat.indexOf(h))" @click="emit('open', h)">
        <span class="shl-type mono"><Icon :name="TYPE_ICON[h.kind] || 'doc'" :size="12" /></span>
        <span class="shl-body">
          <span class="shl-line">
            <span class="shl-title">{{ h.title }}</span>
            <span v-if="h.project_name && h.kind !== 'brief'" class="shl-crumb mono">{{ h.project_name }}</span>
          </span>
          <span v-if="h.description" class="shl-desc">{{ h.description }}</span>
          <!-- eslint-disable-next-line vue/no-v-html — sanitizé (b/mark seulement) -->
          <span v-if="h.passage" class="shl-passage" v-html="safe(h.passage)" />
        </span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.shl-fam { font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--color-faint); padding: 8px 10px 3px; }
.shl-hit { display: flex; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border: none; background: none; cursor: pointer; border-radius: var(--radius-md); font: inherit; }
.shl-hit.on, .shl-hit:hover { background: var(--color-paper-2); }
.shl-type { flex: none; display: inline-flex; align-items: center; color: var(--color-mute); padding-top: 2px; }
.shl-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.shl-line { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.shl-title { font-weight: 600; font-size: 13.5px; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.shl-crumb { font-size: 10px; color: var(--color-faint); flex: none; }
.shl-desc { font-size: 12px; color: var(--color-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.shl-passage { font-size: 12px; color: var(--color-ink-soft); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.shl-passage :deep(b), .shl-passage :deep(mark) { background: var(--color-saffron-soft); color: var(--color-ink); font-weight: 600; }
</style>
