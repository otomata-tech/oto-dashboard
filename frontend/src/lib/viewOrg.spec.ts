// Consultation (view-as, ADR 0023) — état front qui décide QUELS headers de scope
// (`X-Oto-Org` / `X-Oto-Group` / `X-Oto-View-As`) partent au backend. Un bug ici =
// le dashboard affiche l'org/le user de quelqu'un d'autre (fuite d'isolation), d'où
// les invariants verrouillés ci-dessous. Depuis 2026-07-06 l'org de consultation vit
// dans l'URL (`/o/:orgId/…`) → variable module `setViewOrgId`, plus localStorage.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  parseOrgFromPath, orgRedirectPath,
  currentViewOrg, setViewOrgId,
  getViewGroup, setViewGroup,
  getViewUser, setViewUser,
  viewHeaders,
} from './viewOrg'

beforeEach(() => {
  localStorage.clear()
  setViewOrgId(null)
})

describe('parseOrgFromPath', () => {
  it('extrait l\'id du préfixe /o/:id/…', () => {
    expect(parseOrgFromPath('/o/42/connectors')).toBe('42')
    expect(parseOrgFromPath('/o/7')).toBe('7')
    expect(parseOrgFromPath('/o/7/data/9')).toBe('7')
  })
  it('null hors préfixe org', () => {
    expect(parseOrgFromPath('/connectors')).toBeNull()
    expect(parseOrgFromPath('/platform/users')).toBeNull()
    expect(parseOrgFromPath('/organization/x')).toBeNull() // pas /o/<digits>
  })
})

describe('org de consultation (variable module, URL-synced)', () => {
  it('round-trip via setViewOrgId', () => {
    expect(currentViewOrg()).toBeNull()
    setViewOrgId('42')
    expect(currentViewOrg()).toBe('42')
    setViewOrgId(null)
    expect(currentViewOrg()).toBeNull()
  })
})

describe('orgRedirectPath (garde routeur)', () => {
  it('préfixe un chemin org-scopé nu avec l\'org courante', () => {
    expect(orgRedirectPath('/connectors', true, false, '35')).toBe('/o/35/connectors')
    expect(orgRedirectPath('/data/9', true, false, '35')).toBe('/o/35/data/9')
  })
  it('laisse passer (null) : non org-scopé', () => {
    expect(orgRedirectPath('/account', false, false, '35')).toBeNull()
    expect(orgRedirectPath('/platform/users', false, false, '35')).toBeNull()
  })
  it('laisse passer (null) : déjà préfixé', () => {
    expect(orgRedirectPath('/o/40/connectors', true, true, '35')).toBeNull()
  })
  it('laisse passer (null) : org courante inconnue (1er chargement)', () => {
    expect(orgRedirectPath('/connectors', true, false, null)).toBeNull()
  })
})

describe('équipe consultée (localStorage)', () => {
  it('round-trip et clear', () => {
    setViewGroup('7')
    expect(getViewGroup()).toBe('7')
    setViewGroup(null)
    expect(getViewGroup()).toBeNull()
  })
})

describe('view user (view-as)', () => {
  it('round-trip d\'un {sub,name}', () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    expect(getViewUser()).toEqual({ sub: 'u1', name: 'Alice' })
  })
  it('null sur JSON corrompu au lieu de lever', () => {
    localStorage.setItem('oto_view_user', '{not json')
    expect(getViewUser()).toBeNull()
  })
  it('entrer en view-as efface l\'équipe consultée (invariant)', () => {
    setViewGroup('7')
    setViewUser({ sub: 'u1', name: 'Alice' })
    expect(getViewGroup()).toBeNull()
  })
  it('clear view-as ne laisse pas de résidu', () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    setViewUser(null)
    expect(getViewUser()).toBeNull()
  })
})

describe('viewHeaders precedence', () => {
  it('vide quand rien n\'est posé (→ maison)', () => {
    expect(viewHeaders()).toEqual({})
  })
  it('émet X-Oto-Org (URL) et X-Oto-Group (localStorage) ensemble', () => {
    setViewOrgId('42')
    setViewGroup('7')
    expect(viewHeaders()).toEqual({ 'X-Oto-Org': '42', 'X-Oto-Group': '7' })
  })
  it('émet seulement X-Oto-Org sans équipe', () => {
    setViewOrgId('42')
    expect(viewHeaders()).toEqual({ 'X-Oto-Org': '42' })
  })
  it('view-as prime : seulement X-Oto-View-As, jamais un view-org périmé', () => {
    setViewOrgId('42')
    setViewGroup('7')
    setViewUser({ sub: 'u1', name: 'Alice' })
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u1' })
  })
})
