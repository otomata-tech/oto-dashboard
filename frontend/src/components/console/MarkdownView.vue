<script setup lang="ts">
// Rendu markdown sûr : marked (parse) + DOMPurify (sanitization XSS) avant v-html.
// Réutilisable partout où l'on affiche du body_md (viewer public #4a, previews…).
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{ source?: string | null }>()
const html = computed(() =>
  DOMPurify.sanitize(marked.parse(props.source ?? '', { async: false }) as string))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html — contenu sanitizé par DOMPurify -->
  <div class="md" v-html="html"></div>
</template>

<style scoped>
.md { font-size: 14px; line-height: 1.6; color: var(--color-ink, #2a2a2a); }
.md :deep(h1) { font-size: 1.6em; margin: .6em 0 .3em; }
.md :deep(h2) { font-size: 1.3em; margin: .8em 0 .3em; }
.md :deep(h3) { font-size: 1.1em; margin: .8em 0 .3em; }
.md :deep(p) { margin: .5em 0; }
.md :deep(ul), .md :deep(ol) { margin: .5em 0; padding-left: 1.4em; }
.md :deep(li) { margin: .2em 0; }
.md :deep(a) { color: var(--color-cobalt-ink, #2b5ca8); text-decoration: underline; }
.md :deep(code) { background: var(--color-paper-3, #f5f1e8); border-radius: 4px; padding: 1px 5px; font-size: .9em; }
.md :deep(pre) { background: var(--color-paper-3, #f5f1e8); border-radius: 8px; padding: 12px; overflow: auto; }
.md :deep(pre code) { background: none; padding: 0; }
.md :deep(blockquote) { margin: .6em 0; padding-left: 12px; border-left: 3px solid var(--color-hair-soft, #e6e6e3); color: var(--color-ink-soft, #6b6b6b); }
.md :deep(table) { border-collapse: collapse; margin: .6em 0; }
.md :deep(th), .md :deep(td) { border: 1px solid var(--color-hair-soft, #e6e6e3); padding: 5px 9px; font-size: 13px; }
.md :deep(img) { max-width: 100%; }
</style>
