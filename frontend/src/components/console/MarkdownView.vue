<script setup lang="ts">
// Rendu markdown sûr : marked (parse) + DOMPurify (sanitization XSS) avant v-html.
// Réutilisable partout où l'on affiche du body_md (viewer public #4a, previews…).
//
// Backlinks (lot 3 Ship 4) : si `resolveLink` est fourni, les `[[Titre]]` sont
// pré-transformés en liens internes AVANT marked — résolu → `data-doc` cliquable
// (émet `navigate-doc`), inexistant → lien-souche `data-stub` (émet `create-stub`,
// clic = créer la page). Sans `resolveLink`, le composant est inchangé (context-free).
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  source?: string | null
  resolveLink?: (title: string) => number | null
}>()
const emit = defineEmits<{ (e: 'navigate-doc', id: number): void; (e: 'create-stub', title: string): void }>()

const WIKILINK = /\[\[\s*([^[\]\n]{1,200}?)\s*\]\]/g
function escAttr(s: string) { return s.replace(/"/g, '&quot;') }
function escText(s: string) { return s.replace(/</g, '&lt;').replace(/>/g, '&gt;') }

const prepared = computed(() => {
  const src = props.source ?? ''
  if (!props.resolveLink) return src
  return src.replace(WIKILINK, (_m, raw: string) => {
    const title = raw.split(/\s+/).join(' ')
    const id = props.resolveLink!(title)
    return id != null
      ? `<a href="#" class="wikilink" data-doc="${id}">${escText(title)}</a>`
      : `<a href="#" class="wikilink wikilink--stub" data-stub="${escAttr(title)}">${escText(title)}</a>`
  })
})

const html = computed(() =>
  DOMPurify.sanitize(marked.parse(prepared.value, { async: false }) as string))

function onClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a.wikilink') as HTMLElement | null
  if (!a) return
  e.preventDefault()
  const doc = a.getAttribute('data-doc')
  if (doc) return emit('navigate-doc', Number(doc))
  const stub = a.getAttribute('data-stub')
  if (stub != null) emit('create-stub', stub)
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html — contenu sanitizé par DOMPurify -->
  <div class="md" @click="onClick" v-html="html"></div>
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
.md :deep(.wikilink) { color: var(--color-cobalt-ink); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--color-cobalt-ink) 30%, transparent); cursor: pointer; }
.md :deep(.wikilink:hover) { border-bottom-color: var(--color-cobalt-ink); }
.md :deep(.wikilink--stub) { color: var(--color-mute); border-bottom-style: dashed; }
</style>
