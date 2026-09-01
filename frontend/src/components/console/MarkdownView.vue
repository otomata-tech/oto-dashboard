<script setup lang="ts">
// Rendu markdown sûr : marked (parse) + DOMPurify (sanitization XSS) avant v-html.
// Réutilisable partout où l'on affiche du body_md (viewer public #4a, previews…).
//
// Backlinks (lot 3 Ship 4) : si `resolveLink` est fourni, les `[[Titre]]` sont
// pré-transformés en liens internes AVANT marked — résolu → `data-doc` cliquable
// (émet `navigate-doc`), inexistant → lien-souche `data-stub` (émet `create-stub`,
// clic = créer la page). Sans `resolveLink`, le composant est inchangé (context-free).
//
// Mermaid (issue #145, signal 564) : marked rend un bloc ```mermaid``` en
// <pre><code class="language-mermaid"> brut — jamais interprété. Après chaque
// (ré)écriture du HTML par v-html, on repère ces blocs dans le DOM déjà sanitizé,
// on relit leur `textContent` (le navigateur redécode les entités posées par
// marked) et on les remplace par le SVG rendu via `mermaid.render()` — SVG
// re-sanitizé avant insertion, la source n'étant pas fiable a priori. Un diagramme
// invalide ne casse pas la page : la source reste visible, une notice s'affiche.
import { computed, onMounted, ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'

const props = defineProps<{
  source?: string | null
  resolveLink?: (title: string) => number | null
}>()
const emit = defineEmits<{ (e: 'navigate-doc', id: number): void; (e: 'create-stub', title: string): void }>()

const rootEl = ref<HTMLElement | null>(null)

// Un seul mermaid.initialize() pour toute la session (coûteux, idempotent côté
// rendu) — les couleurs empruntent les tokens du design system (ADR 0007), avec
// un fallback littéral si la variable n'est pas définie dans la page hôte.
let mermaidReady = false
function ensureMermaid() {
  if (mermaidReady) return
  mermaidReady = true
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      fontFamily: 'var(--font-sans, "Familjen Grotesk", system-ui, sans-serif)',
      background: 'var(--color-surface, #ffffff)',
      primaryColor: 'var(--color-saffron-soft, #fbe7a8)',
      primaryTextColor: 'var(--color-ink, #2a2a2a)',
      primaryBorderColor: 'var(--color-hair, #e6e6e3)',
      lineColor: 'var(--color-ink-soft, #6b6b6b)',
      textColor: 'var(--color-ink, #2a2a2a)',
      edgeLabelBackground: 'var(--color-surface, #ffffff)',
      tertiaryColor: 'var(--color-paper-3, #f5f1e8)',
    },
  })
}

let mermaidSeq = 0

async function renderMermaidBlocks() {
  const root = rootEl.value
  if (!root) return
  const blocks = [...root.querySelectorAll<HTMLElement>('code.language-mermaid')]
  if (!blocks.length) return
  ensureMermaid()
  for (const code of blocks) {
    const pre = code.closest('pre')
    if (!pre || pre.dataset.mermaidDone) continue
    pre.dataset.mermaidDone = '1'
    const source = (code.textContent ?? '').trim()
    const id = `md-mermaid-${++mermaidSeq}`
    try {
      const { svg } = await mermaid.render(id, source)
      const container = document.createElement('div')
      container.className = 'md-mermaid'
      container.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
      pre.replaceWith(container)
    } catch (err) {
      pre.classList.add('md-mermaid-broken')
      const notice = document.createElement('div')
      notice.className = 'md-mermaid-err'
      notice.textContent = `diagramme mermaid invalide — ${err instanceof Error ? err.message : String(err)}`
      pre.before(notice)
    }
  }
}

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

// v-html remplace tout le sous-arbre à chaque changement de `html` (pas de diff
// vdom). ⚠️ un watch(..., { immediate: true, flush: 'post' }) exécute quand même
// son PREMIER appel de façon SYNCHRONE au setup() — `flush: 'post'` ne régit que
// les déclenchements réactifs ultérieurs, pas l'appel immédiat, qui tourne donc
// avant le montage (`rootEl.value` encore null, aucun bloc trouvé, jamais rejoué
// puisque `html` ne change plus si `source` ne change pas). D'où deux hooks
// distincts : onMounted() pour le premier rendu (DOM garanti), watch (sans
// immediate) pour une source qui change en cours de vie du composant.
onMounted(() => { void renderMermaidBlocks() })
watch(html, () => { void renderMermaidBlocks() }, { flush: 'post' })

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
  <div ref="rootEl" class="md" @click="onClick" v-html="html"></div>
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
.md :deep(.md-mermaid) { margin: .8em 0; padding: 12px; background: var(--color-surface, #fff); border: 1px solid var(--color-hair-soft, #e6e6e3); border-radius: 8px; overflow: auto; text-align: center; }
.md :deep(.md-mermaid svg) { max-width: 100%; height: auto; }
.md :deep(.md-mermaid-err) { margin: .8em 0 0; font-size: 12.5px; color: var(--color-terra-ink, #a33); }
.md :deep(pre.md-mermaid-broken) { margin-top: .3em; }
</style>
