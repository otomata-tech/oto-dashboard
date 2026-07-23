import { describe, it, expect } from 'vitest'
import { parseDocSegments, hasDataEmbed } from './docEmbeds'

describe('parseDocSegments', () => {
  it('un corps sans embed = un seul segment prose', () => {
    const segs = parseDocSegments('# Titre\n\ntexte.')
    expect(segs).toEqual([{ type: 'md', text: '# Titre\n\ntexte.' }])
  })

  it('découpe prose | embed | prose', () => {
    const md = 'intro\n\n```oto-data\nmarches-locaux\n```\n\nfin'
    const segs = parseDocSegments(md)
    expect(segs.map((s) => s.type)).toEqual(['md', 'data', 'md'])
    expect(segs[1]).toEqual({ type: 'data', ns: 'marches-locaux' })
    expect((segs[0] as { text: string }).text).toContain('intro')
    expect((segs[2] as { text: string }).text).toContain('fin')
  })

  it('supporte plusieurs embeds + id numérique', () => {
    const md = '```oto-data\n7\n```\ntexte\n```oto-data\nautre\n```'
    const segs = parseDocSegments(md)
    expect(segs.filter((s) => s.type === 'data').map((s) => (s as { ns: string }).ns))
      .toEqual(['7', 'autre'])
  })

  it('hasDataEmbed', () => {
    expect(hasDataEmbed('x\n```oto-data\nn\n```')).toBe(true)
    expect(hasDataEmbed('```js\ncode\n```')).toBe(false)
  })
})
