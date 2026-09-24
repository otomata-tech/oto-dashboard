// Consultation (view-as, ADR 0023) — état front qui décide QUELS headers de scope
// (`X-Oto-Org` / `X-Oto-Group` / `X-Oto-View-As`) partent au backend. Un bug ici =
// le dashboard affiche l'org/le user de quelqu'un d'autre (fuite d'isolation), d'où
// les invariants verrouillés ci-dessous. Depuis 2026-07-06 l'org ET l'équipe de
// consultation vivent dans l'URL (`/o/:orgId[/g/:groupId]/…`) → variables module
// `setViewOrgId`/`setViewGroupId`, plus localStorage. Le view-as USER reste localStorage.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  parseOrgFromPath, parseGroupFromPath, consultRedirectPath, scopedPath,
  currentViewOrg, setViewOrgId, currentViewGroup, setViewGroupId,
  getViewUser, setViewUser,
  viewHeaders,
  acceptViewAsWrite, revokeViewAsWrite, viewAsWriteAccepted,
} from './viewOrg'

beforeEach(() => {
  revokeViewAsWrite()
  localStorage.clear()
  setViewOrgId(null)
  setViewGroupId(null)
})

describe('parseOrgFromPath / parseGroupFromPath', () => {
  it('extrait l\'org du préfixe /o/:id/…', () => {
    expect(parseOrgFromPath('/o/42/connectors')).toBe('42')
    expect(parseOrgFromPath('/o/7')).toBe('7')
    expect(parseOrgFromPath('/o/7/g/9/data/3')).toBe('7')
  })
  it('extrait l\'équipe du préfixe /o/:id/g/:gid/…', () => {
    expect(parseGroupFromPath('/o/7/g/9/data/3')).toBe('9')
    expect(parseGroupFromPath('/o/7/g/9')).toBe('9')
  })
  it('null hors préfixe', () => {
    expect(parseOrgFromPath('/connectors')).toBeNull()
    expect(parseOrgFromPath('/organization/x')).toBeNull() // pas /o/<digits>
    expect(parseGroupFromPath('/o/7/connectors')).toBeNull() // org sans équipe
    expect(parseGroupFromPath('/connectors')).toBeNull()
  })
})

describe('org / équipe de consultation (variables module, URL-synced)', () => {
  it('round-trip via setViewOrgId / setViewGroupId', () => {
    expect(currentViewOrg()).toBeNull()
    expect(currentViewGroup()).toBeNull()
    setViewOrgId('42'); setViewGroupId('7')
    expect(currentViewOrg()).toBe('42')
    expect(currentViewGroup()).toBe('7')
    setViewOrgId(null); setViewGroupId(null)
    expect(currentViewOrg()).toBeNull()
    expect(currentViewGroup()).toBeNull()
  })
})

describe('scopedPath (préfixe partagé garde ↔ useScopedLink)', () => {
  it('préfixe org seule', () => {
    expect(scopedPath('/connectors', '81', null)).toBe('/o/81/connectors')
    expect(scopedPath('/projects/8', '81', null)).toBe('/o/81/projects/8')
  })
  it('préfixe org + équipe', () => {
    expect(scopedPath('/data/3', '81', '7')).toBe('/o/81/g/7/data/3')
  })
  it('chemin nu quand pas d\'org (maison)', () => {
    expect(scopedPath('/connectors', null, null)).toBe('/connectors')
    expect(scopedPath('/connectors', null, '7')).toBe('/connectors')
  })
  it('préserve la query en la gardant après le préfixe', () => {
    expect(scopedPath('/connectors?tab=marketplace', '81', null)).toBe('/o/81/connectors?tab=marketplace')
  })
})

describe('consultRedirectPath (garde routeur)', () => {
  it('préfixe un chemin nu avec l\'org courante', () => {
    expect(consultRedirectPath('/connectors', true, false, '35', null)).toBe('/o/35/connectors')
    expect(consultRedirectPath('/data/9', true, false, '35', null)).toBe('/o/35/data/9')
  })
  it('préfixe avec org + équipe quand une équipe est consultée', () => {
    expect(consultRedirectPath('/connectors', true, false, '35', '7')).toBe('/o/35/g/7/connectors')
  })
  it('laisse passer (null) : non org-scopé', () => {
    expect(consultRedirectPath('/account', false, false, '35', '7')).toBeNull()
    expect(consultRedirectPath('/platform/users', false, false, '35', null)).toBeNull()
  })
  it('laisse passer (null) : déjà préfixé', () => {
    expect(consultRedirectPath('/o/40/connectors', true, true, '35', '7')).toBeNull()
  })
  it('laisse passer (null) : contexte inconnu (1er chargement)', () => {
    expect(consultRedirectPath('/connectors', true, false, null, null)).toBeNull()
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
  it('émet X-Oto-Org et X-Oto-Group ensemble (tous deux de l\'URL)', () => {
    setViewOrgId('42'); setViewGroupId('7')
    expect(viewHeaders()).toEqual({ 'X-Oto-Org': '42', 'X-Oto-Group': '7' })
  })
  it('émet seulement X-Oto-Org sans équipe', () => {
    setViewOrgId('42')
    expect(viewHeaders()).toEqual({ 'X-Oto-Org': '42' })
  })
  it('view-as prime : seulement X-Oto-View-As, jamais un view-org/group périmé', () => {
    setViewOrgId('42'); setViewGroupId('7')
    setViewUser({ sub: 'u1', name: 'Alice' })
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u1' })
  })
})

// Écrire en tant que (24/09/2026) : `X-Oto-View-As-Write` ne part QU'après le geste
// d'acceptation, pour la cible acceptée, et tombe en quittant la vue ou en changeant de
// cible. Un header d'écriture qui survivrait écrirait au nom d'un compte sans l'avoir voulu.
describe('écrire en tant que (view-as write)', () => {
  it('aucun header d\'écriture avant acceptation', () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u1' })
    expect(viewAsWriteAccepted()).toBe(false)
  })
  it('après acceptation, le header part avec le view-as', () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    acceptViewAsWrite()
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u1', 'X-Oto-View-As-Write': '1' })
  })
  it('quitter la vue fait tomber l\'acceptation', () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    acceptViewAsWrite()
    setViewUser(null)
    expect(viewHeaders()).toEqual({})
    setViewUser({ sub: 'u1', name: 'Alice' })
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u1' })
  })
  it('changer de cible fait tomber l\'acceptation', () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    acceptViewAsWrite()
    setViewUser({ sub: 'u2', name: 'Bob' })
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u2' })
  })
  it('revenir en lecture seule retire le header', () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    acceptViewAsWrite()
    revokeViewAsWrite()
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u1' })
  })
  it('sans vue, accepter ne pose rien', () => {
    acceptViewAsWrite()
    expect(viewHeaders()).toEqual({})
  })
})
