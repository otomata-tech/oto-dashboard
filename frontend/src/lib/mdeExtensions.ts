// Extensions TipTap de l'éditeur markdown inline (MarkdownEditor.vue).
// Sorties dans un module à part pour que le test de round-trip (mdeExtensions.spec.ts)
// vérifie EXACTEMENT le set embarqué : tout markdown qu'on sait afficher (MarkdownView)
// doit survivre au cycle markdown → ProseMirror → markdown, sinon éditer = perdre.
import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'
import { TableKit } from '@tiptap/extension-table'

export function mdeExtensions(placeholder = ''): AnyExtension[] {
  return [
    // Un clic sur un lien doit éditer, pas naviguer (la navigation vit en lecture).
    StarterKit.configure({ link: { openOnClick: false } }),
    TableKit,
    Markdown,
    Placeholder.configure({ placeholder }),
  ]
}
