// rowsToCsv : échappement RFC 4180 + aplatissement lisible des colonnes composites
// (oto-dashboard#137 — une liste ne part plus en JSON brut dans une cellule).
import { describe, expect, it } from 'vitest'
import { rowsToCsv } from './csv'

describe('rowsToCsv — scalaires', () => {
  it('assemble l\'en-tête et les lignes en CRLF', () => {
    expect(rowsToCsv([{ a: 1, b: 'x' }], ['a', 'b'])).toBe('a,b\r\n1,x')
  })

  it('échappe une valeur qui contient une virgule, un guillemet ou un retour ligne', () => {
    expect(rowsToCsv([{ a: 'a,b' }], ['a'])).toBe('a\r\n"a,b"')
    expect(rowsToCsv([{ a: 'say "hi"' }], ['a'])).toBe('a\r\n"say ""hi"""')
    expect(rowsToCsv([{ a: 'l1\nl2' }], ['a'])).toBe('a\r\n"l1\nl2"')
  })

  it('rend une cellule vide pour null/undefined', () => {
    expect(rowsToCsv([{ a: null, b: undefined }], ['a', 'b'])).toBe('a,b\r\n,')
  })

  it("n'émet que l'en-tête sur un jeu de lignes vide", () => {
    expect(rowsToCsv([], ['a', 'b'])).toBe('a,b')
  })
})

describe('rowsToCsv — colonnes composites (#137)', () => {
  it('une liste de scalaires est jointe par « | », pas du JSON', () => {
    const s = rowsToCsv([{ tags: ['x', 'y'] }], ['tags'])
    expect(s).toBe('tags\r\nx | y')
    expect(s).not.toContain('[')
  })

  it('une liste d\'objets rend chaque item en `clé: valeur`, items séparés par « | »', () => {
    const rows = [{ contacts: [{ nom: 'A', email: 'a@x.co' }, { nom: 'B', email: 'b@x.co' }] }]
    const s = rowsToCsv(rows, ['contacts'])
    expect(s).toContain('nom: A, email: a@x.co | nom: B, email: b@x.co')
    expect(s).not.toMatch(/[[\]{}]/)
  })

  it('un objet simple (non liste) est aplati en `clé: valeur, clé: valeur` (échappé : contient une virgule)', () => {
    expect(rowsToCsv([{ meta: { a: 1, b: 2 } }], ['meta'])).toBe('meta\r\n"a: 1, b: 2"')
  })

  it('une liste vide rend une cellule vide — la ligne ne disparaît pas pour autant', () => {
    expect(rowsToCsv([{ tags: [] }], ['tags'])).toBe('tags\r\n')
  })
})
