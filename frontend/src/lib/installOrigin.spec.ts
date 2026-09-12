// Une ligne par valeur d'`origin` servie (ADR 0050 §E7) — les libellés sont gravés ici :
// les changer est une décision, pas un effet de bord.
import { describe, expect, it } from 'vitest'
import { originBadge } from './installOrigin'

describe('provenance d\'une installation — ce que le membre lit', () => {
  it.each([
    ['kit', 'installé par ton organisation'],
    ['admin', 'ouvert par un administrateur'],
    ['membre', null],
    ['socle', null],
    ['inconnue', null],
    [null, null],
    [undefined, null],
  ] as const)('origin=%s → %s', (origin, texte) => {
    expect(originBadge(origin, 'active')?.text ?? null).toBe(texte)
  })

  it('installé mais en veille : toujours posé par le kit', () => {
    expect(originBadge('kit', 'paused')?.text).toBe('installé par ton organisation')
  })

  it('non installé : aucun badge, même si le kit l\'avait posé un jour', () => {
    expect(originBadge('kit', 'not_selected')).toBeNull()
    expect(originBadge('admin', 'not_selected')).toBeNull()
  })
})
