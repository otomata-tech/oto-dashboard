// La règle de désignation partagée par `/procedures/:id`, `/projects/:id` et `/data/:id`
// (oto#201, oto#203) : l'id avant le nom, jamais de choix silencieux entre homonymes.
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api'
import { resolveTarget, targetRefusal } from './routeTarget'

type Objet = { id: number; name: string | null }
const CLES = [(x: Objet) => x.id, (x: Objet) => x.name]

describe('resolveTarget — une adresse désigne un objet, ou le dit', () => {
  it("l'identifiant tranche avant le nom, quel que soit l'ordre de la liste", () => {
    const items = [{ id: 12, name: '41' }, { id: 41, name: 'clients' }]
    expect(resolveTarget('41', items, CLES)).toEqual({ kind: 'found', item: items[1] })
  })

  it('un nom porté par un seul objet le désigne', () => {
    const items = [{ id: 12, name: 'prospects' }, { id: 41, name: 'clients' }]
    expect(resolveTarget('clients', items, CLES)).toEqual({ kind: 'found', item: items[1] })
  })

  it('un nom porté par plusieurs objets ne choisit pas : tous les candidats, dans leur ordre', () => {
    const items = [{ id: 41, name: 'clients' }, { id: 12, name: 'prospects' }, { id: 77, name: 'clients' }]
    expect(resolveTarget('clients', items, CLES))
      .toEqual({ kind: 'ambiguous', candidates: [items[0], items[2]] })
  })

  it('rien ne correspond : inconnu, jamais le premier de la liste', () => {
    expect(resolveTarget('inconnu', [{ id: 1, name: 'a' }], CLES)).toEqual({ kind: 'unknown' })
    expect(resolveTarget('1', [], CLES)).toEqual({ kind: 'unknown' })
  })

  it('une clé absente ne correspond à rien, pas même au texte « null »', () => {
    expect(resolveTarget('null', [{ id: 1, name: null }], [(x: Objet) => x.name]))
      .toEqual({ kind: 'unknown' })
  })
})

describe('targetRefusal — le refus tel que le serveur l’a rendu', () => {
  it('rend le code et la phrase du serveur', () => {
    expect(targetRefusal('#9', new ApiError(404, 'unknown_doc', 'Aucune page #9.')))
      .toEqual({ what: '#9', code: '404 unknown_doc', detail: 'Aucune page #9.' })
  })

  it('hors réponse du serveur, aucun code inventé', () => {
    const r = targetRefusal('#9', new Error('réseau coupé'))
    expect(r.what).toBe('#9')
    expect(r.code).toBeNull()
  })
})
