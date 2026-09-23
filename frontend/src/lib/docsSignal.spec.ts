import { describe, expect, it } from 'vitest'
import { bumpDocs, docsVersion } from './docsSignal'

describe('docsSignal', () => {
  it('compte par projet, et rend le numéro émis', () => {
    expect(docsVersion(900)).toBe(0)
    expect(bumpDocs(900)).toBe(1)
    expect(bumpDocs(900)).toBe(2)
    expect(docsVersion(901)).toBe(0)
  })
})
