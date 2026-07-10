// Smoke test de montage : le markdown entrant est rendu en riche (WYSIWYG), une
// commande de la toolbar ressort par le v-model en markdown. Complète le test de
// round-trip pur (lib/mdeExtensions.spec.ts) en couvrant le câblage Vue.
import { describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import MarkdownEditor from './MarkdownEditor.vue'

async function mountEditor(initial: string) {
  const updates: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(MarkdownEditor, {
    modelValue: initial,
    'onUpdate:modelValue': (v: string) => updates.push(v),
  })
  app.mount(host)
  await nextTick()
  return { host, updates, unmount: () => { app.unmount(); host.remove() } }
}

describe('MarkdownEditor', () => {
  it('rend le markdown entrant en riche', async () => {
    const { host, unmount } = await mountEditor('# Salut\n\nUn **gras**.')
    expect(host.querySelector('.tiptap h1')?.textContent).toBe('Salut')
    expect(host.querySelector('.tiptap strong')?.textContent).toBe('gras')
    unmount()
  })

  it('une commande toolbar ressort en markdown par le v-model', async () => {
    // Le bouton tableau ne dépend pas d'une sélection DOM (flaky sous jsdom) :
    // il modifie le doc au curseur → l'update doit remonter la table GFM.
    const { host, updates, unmount } = await mountEditor('du texte')
    const btn = host.querySelector<HTMLButtonElement>('button[title="insérer un tableau"]')
    expect(btn).toBeTruthy()
    btn!.click()
    await nextTick()
    expect(updates.at(-1)).toMatch(/\|\s*---/)
    unmount()
  })
})
