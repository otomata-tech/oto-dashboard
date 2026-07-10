<script setup lang="ts">
// Éditeur markdown INLINE (TipTap v3) — remplace les textarea bruts du brief et des
// pages projet. WYSIWYG à l'écran, markdown en source de vérité : le v-model porte
// la chaîne markdown (contrat inchangé côté API), la conversion vit dans l'éditeur.
// Les raccourcis de frappe markdown (## , - , ``` , > …) convertissent à la volée.
// Set d'extensions partagé avec le test de round-trip : lib/mdeExtensions.ts.
import { ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import Icon from './Icon.vue'
import { usePrompt } from '@/composables/usePrompt'
import { mdeExtensions } from '@/lib/mdeExtensions'

const props = defineProps<{ modelValue: string; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const { promptText } = usePrompt()

// `tick` force la réévaluation des états actifs de la toolbar à chaque transaction
// (l'instance Editor n'est pas réactive en profondeur).
const tick = ref(0)
const editor = useEditor({
  content: props.modelValue,
  contentType: 'markdown',
  extensions: mdeExtensions(props.placeholder ?? ''),
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.getMarkdown()),
  onTransaction: () => { tick.value++ },
})

// Resynchronise si le parent remplace la valeur (annuler, changement de sélection).
watch(() => props.modelValue, (v) => {
  const e = editor.value
  if (!e || v === e.getMarkdown()) return
  e.commands.setContent(v ?? '', { contentType: 'markdown' })
})

const active = (name: string, attrs?: Record<string, unknown>) =>
  (tick.value, editor.value?.isActive(name, attrs) ?? false)

async function toggleLink() {
  const e = editor.value
  if (!e) return
  if (e.isActive('link')) { e.chain().focus().unsetLink().run(); return }
  const url = await promptText('Insérer un lien', { label: 'URL', placeholder: 'https://…', required: true })
  if (!url) return
  e.chain().focus().setLink({ href: url }).run()
}
</script>

<template>
  <div class="mde">
    <div class="mde__bar" role="toolbar" aria-label="mise en forme">
      <button type="button" class="mde__b" :class="{ on: active('bold') }" title="gras (Ctrl+B)"
        @click="editor?.chain().focus().toggleBold().run()"><Icon name="bold" :size="14" /></button>
      <button type="button" class="mde__b" :class="{ on: active('italic') }" title="italique (Ctrl+I)"
        @click="editor?.chain().focus().toggleItalic().run()"><Icon name="italic" :size="14" /></button>
      <button type="button" class="mde__b" :class="{ on: active('strike') }" title="barré"
        @click="editor?.chain().focus().toggleStrike().run()"><Icon name="strikethrough" :size="14" /></button>
      <button type="button" class="mde__b" :class="{ on: active('code') }" title="code inline"
        @click="editor?.chain().focus().toggleCode().run()"><Icon name="code" :size="14" /></button>
      <span class="mde__sep"></span>
      <button v-for="lv in [1, 2, 3]" :key="lv" type="button" class="mde__b mde__b--txt"
        :class="{ on: active('heading', { level: lv }) }" :title="`titre ${lv}`"
        @click="editor?.chain().focus().toggleHeading({ level: lv as 1 | 2 | 3 }).run()">H{{ lv }}</button>
      <span class="mde__sep"></span>
      <button type="button" class="mde__b" :class="{ on: active('bulletList') }" title="liste à puces"
        @click="editor?.chain().focus().toggleBulletList().run()"><Icon name="list" :size="14" /></button>
      <button type="button" class="mde__b" :class="{ on: active('orderedList') }" title="liste numérotée"
        @click="editor?.chain().focus().toggleOrderedList().run()"><Icon name="list-ordered" :size="14" /></button>
      <button type="button" class="mde__b" :class="{ on: active('blockquote') }" title="citation"
        @click="editor?.chain().focus().toggleBlockquote().run()"><Icon name="text-quote" :size="14" /></button>
      <button type="button" class="mde__b" :class="{ on: active('codeBlock') }" title="bloc de code"
        @click="editor?.chain().focus().toggleCodeBlock().run()"><Icon name="doc" :size="14" /></button>
      <span class="mde__sep"></span>
      <button type="button" class="mde__b" :class="{ on: active('link') }" title="lien"
        @click="toggleLink"><Icon name="link" :size="14" /></button>
      <button v-if="!active('table')" type="button" class="mde__b" title="insérer un tableau"
        @click="editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()"><Icon name="table" :size="14" /></button>
      <!-- contextuel : dans un tableau -->
      <template v-else>
        <button type="button" class="mde__b mde__b--txt" title="ajouter une ligne"
          @click="editor?.chain().focus().addRowAfter().run()">+ ligne</button>
        <button type="button" class="mde__b mde__b--txt" title="ajouter une colonne"
          @click="editor?.chain().focus().addColumnAfter().run()">+ col</button>
        <button type="button" class="mde__b mde__b--txt mde__b--danger" title="supprimer le tableau"
          @click="editor?.chain().focus().deleteTable().run()">suppr. tableau</button>
      </template>
    </div>
    <EditorContent :editor="editor" class="mde__body" />
  </div>
</template>

<style scoped>
.mde { width: 100%; max-width: 720px; border: 1px solid var(--color-hair); border-radius: var(--radius-md); background: var(--color-surface); }
.mde:focus-within { border-color: var(--color-saffron); }

.mde__bar { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 5px 7px; border-bottom: 1px solid var(--color-hair-soft); }
.mde__b { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 5px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-mute); cursor: pointer; }
.mde__b:hover { background: var(--color-paper-2); color: var(--color-ink); }
.mde__b.on { background: var(--color-saffron-soft); color: var(--color-ink); }
.mde__b--txt { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.mde__b--danger { color: var(--color-terra-ink); }
.mde__sep { width: 1px; height: 16px; background: var(--color-hair-soft); margin: 0 4px; flex: none; }

/* corps éditable — même typo que MarkdownView (.md) pour un WYSIWYG fidèle */
.mde__body :deep(.tiptap) { min-height: 220px; padding: 12px 14px; outline: none; font-size: 14px; line-height: 1.6; color: var(--color-ink); }
.mde__body :deep(.tiptap p.is-editor-empty:first-child::before) { content: attr(data-placeholder); float: left; height: 0; pointer-events: none; color: var(--color-faint); }
.mde__body :deep(.tiptap h1) { font-size: 1.6em; margin: .6em 0 .3em; }
.mde__body :deep(.tiptap h2) { font-size: 1.3em; margin: .8em 0 .3em; }
.mde__body :deep(.tiptap h3) { font-size: 1.1em; margin: .8em 0 .3em; }
.mde__body :deep(.tiptap p) { margin: .5em 0; }
.mde__body :deep(.tiptap ul), .mde__body :deep(.tiptap ol) { margin: .5em 0; padding-left: 1.4em; }
.mde__body :deep(.tiptap li) { margin: .2em 0; }
.mde__body :deep(.tiptap a) { color: var(--color-cobalt-ink); text-decoration: underline; }
.mde__body :deep(.tiptap code) { background: var(--color-paper-3); border-radius: 4px; padding: 1px 5px; font-size: .9em; }
.mde__body :deep(.tiptap pre) { background: var(--color-paper-3); border-radius: var(--radius-md); padding: 12px; overflow: auto; }
.mde__body :deep(.tiptap pre code) { background: none; padding: 0; }
.mde__body :deep(.tiptap blockquote) { margin: .6em 0; padding-left: 12px; border-left: 3px solid var(--color-hair-soft); color: var(--color-ink-soft); }
.mde__body :deep(.tiptap table) { border-collapse: collapse; margin: .6em 0; }
.mde__body :deep(.tiptap th), .mde__body :deep(.tiptap td) { border: 1px solid var(--color-hair-soft); padding: 5px 9px; font-size: 13px; min-width: 48px; }
.mde__body :deep(.tiptap th) { background: var(--color-paper); }
.mde__body :deep(.tiptap .selectedCell) { background: var(--color-saffron-soft); }
.mde__body :deep(.tiptap img) { max-width: 100%; }
</style>
