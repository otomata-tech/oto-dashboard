// Régression oto-dashboard#145 / signal 564 : un bloc ```mermaid``` d'une procédure
// restait en <pre><code> brut dans le dashboard (marked ne connaît pas mermaid) —
// vu par un client en démo. `mermaid.render()` est mocké : jsdom n'implémente pas
// `getBBox`, dont mermaid a besoin pour mesurer le texte — on verrouille le
// CÂBLAGE (détection du fence, remplacement DOM, secours sur erreur), pas le rendu
// visuel du SVG lui-même.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import MarkdownView from './MarkdownView.vue'

const render = vi.fn(async (id: string, source: string) => {
  if (source.includes('BOOM')) throw new Error('syntax error in graph')
  return { svg: `<svg data-id="${id}"><text>${source.length}</text></svg>` }
})

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: (...args: [string, string]) => render(...args) },
}))

// `render` est un mock de MODULE, partagé entre les `it` — sans ce reset, un test
// hérite du compte d'appels du précédent (faux positif sur toHaveBeenCalledTimes).
beforeEach(() => { render.mockClear() })

const macrotask = () => new Promise((r) => setTimeout(r, 0))

async function mount(source: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(MarkdownView, { source })
  app.mount(host)
  // v-html patché (post-flush du watch immediate) puis la chaîne de promesses de
  // renderMermaidBlocks() (await mermaid.render + remplacement DOM) — un macrotask
  // draine tout microtask en attente, plus fiable qu'un nombre fixe de nextTick().
  await nextTick()
  await macrotask()
  return { host, unmount: () => { app.unmount(); host.remove() } }
}

describe('MarkdownView — rendu mermaid natif', () => {
  it('un fence ```mermaid``` devient un SVG rendu, plus de <pre> brut', async () => {
    const { host, unmount } = await mount('```mermaid\ngraph TD; A-->B;\n```')
    expect(host.querySelector('pre code.language-mermaid')).toBeNull()
    const box = host.querySelector('.md-mermaid')
    expect(box).not.toBeNull()
    expect(box!.innerHTML).toContain('<svg')
    expect(render).toHaveBeenCalledWith(expect.stringMatching(/^md-mermaid-/), 'graph TD; A-->B;')
    unmount()
  })

  it('un fence de code normal (non-mermaid) reste un <pre><code> brut', async () => {
    const { host, unmount } = await mount('```js\nconst a = 1\n```')
    expect(host.querySelector('pre code')).not.toBeNull()
    expect(host.querySelector('.md-mermaid')).toBeNull()
    expect(render).not.toHaveBeenCalled()
    unmount()
  })

  it('un diagramme invalide laisse la source visible avec une notice, ne casse pas la page', async () => {
    const { host, unmount } = await mount('```mermaid\nBOOM not a diagram\n```')
    const pre = host.querySelector('pre.md-mermaid-broken')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('BOOM not a diagram')
    const notice = host.querySelector('.md-mermaid-err')
    expect(notice).not.toBeNull()
    expect(notice!.textContent).toContain('diagramme mermaid invalide')
    unmount()
  })

  it('plusieurs blocs mermaid dans la même page sont tous rendus', async () => {
    const { host, unmount } = await mount(
      '```mermaid\ngraph TD; A-->B;\n```\n\ntexte entre deux\n\n```mermaid\ngraph TD; C-->D;\n```',
    )
    expect(host.querySelectorAll('.md-mermaid').length).toBe(2)
    expect(render).toHaveBeenCalledTimes(2)
    unmount()
  })
})
