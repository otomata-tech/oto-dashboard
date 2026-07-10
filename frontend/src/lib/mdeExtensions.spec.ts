// Round-trip markdown → ProseMirror → markdown de l'éditeur inline : les structures
// qu'on sait afficher (MarkdownView) doivent survivre à une édition sans perte.
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { mdeExtensions } from './mdeExtensions'

function roundtrip(md: string): string {
  const editor = new Editor({ content: md, contentType: 'markdown', extensions: mdeExtensions() })
  const out = editor.getMarkdown()
  editor.destroy()
  return out
}

describe('mdeExtensions — round-trip markdown', () => {
  it('préserve titres, emphase, listes, citation et lien', () => {
    const out = roundtrip([
      '# Titre',
      '',
      'Un **gras** et un *italique* et du `code`.',
      '',
      '- puce un',
      '- puce deux',
      '',
      '1. premier',
      '2. second',
      '',
      '> une citation',
      '',
      '[oto](https://oto.cx)',
    ].join('\n'))
    expect(out).toContain('# Titre')
    expect(out).toContain('**gras**')
    expect(out).toContain('*italique*')
    expect(out).toContain('`code`')
    expect(out).toContain('- puce un')
    expect(out).toContain('1. premier')
    expect(out).toContain('> une citation')
    expect(out).toContain('[oto](https://oto.cx)')
  })

  it('préserve les blocs de code fencés', () => {
    const out = roundtrip('```python\nprint("salut")\n```')
    expect(out).toContain('```python')
    expect(out).toContain('print("salut")')
  })

  it('préserve les tables GFM', () => {
    const out = roundtrip([
      '| colonne A | colonne B |',
      '| --- | --- |',
      '| a1 | b1 |',
      '| a2 | b2 |',
    ].join('\n'))
    expect(out).toContain('colonne A')
    expect(out).toMatch(/\|\s*a2\s*\|\s*b2\s*\|/)
    expect(out).toMatch(/\|\s*---/)
  })

  it('préserve les listes imbriquées', () => {
    const out = roundtrip('- parent\n  - enfant\n  - enfant 2')
    expect(out).toContain('- parent')
    expect(out).toMatch(/ {2}- enfant/)
  })

  it('markdown vide → chaîne vide', () => {
    expect(roundtrip('')).toBe('')
  })
})
