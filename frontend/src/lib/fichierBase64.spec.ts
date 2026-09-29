import { describe, expect, it } from 'vitest'
import { fichierEnBase64 } from './fichierBase64'

describe('fichierEnBase64', () => {
  it('rend le base64 NU du contenu, sans préfixe data:', async () => {
    const pdf = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' })
    const b64 = await fichierEnBase64(pdf)
    expect(b64).toBe(btoa('%PDF-1.4 test'))
    expect(b64.startsWith('data:')).toBe(false)
  })
})
