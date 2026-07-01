// Consultation (view-as, ADR 0023) — état front qui décide QUELS headers de scope
// (`X-Oto-Org` / `X-Oto-Group` / `X-Oto-View-As`) partent au backend. Un bug ici =
// le dashboard affiche l'org/le user de quelqu'un d'autre (fuite d'isolation), d'où
// les invariants verrouillés ci-dessous : précédence view-as > org, et « entrer en
// view-as efface la consultation org/équipe ».
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getViewOrg, setViewOrg,
  getViewGroup, setViewGroup,
  getViewUser, setViewUser,
  viewHeaders,
} from './viewOrg'

beforeEach(() => localStorage.clear())

describe('view org/group getters & setters', () => {
  it('round-trips an org id and clears with null', () => {
    expect(getViewOrg()).toBeNull()
    setViewOrg('42')
    expect(getViewOrg()).toBe('42')
    setViewOrg(null)
    expect(getViewOrg()).toBeNull()
  })

  it('round-trips a group id and clears with null', () => {
    setViewGroup('7')
    expect(getViewGroup()).toBe('7')
    setViewGroup(null)
    expect(getViewGroup()).toBeNull()
  })
})

describe('view user (view-as)', () => {
  it('round-trips a {sub,name} object', () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    expect(getViewUser()).toEqual({ sub: 'u1', name: 'Alice' })
  })

  it('returns null on corrupt JSON instead of throwing', () => {
    localStorage.setItem('oto_view_user', '{not json')
    expect(getViewUser()).toBeNull()
  })

  it('entering view-as clears any org/group consultation (invariant)', () => {
    setViewOrg('42')
    setViewGroup('7')
    setViewUser({ sub: 'u1', name: 'Alice' })
    // sa maison suit → la consultation org/équipe précédente est effacée.
    expect(getViewOrg()).toBeNull()
    expect(getViewGroup()).toBeNull()
  })

  it('clearing view-as with null leaves no residue', () => {
    setViewUser({ sub: 'u1', name: 'Alice' })
    setViewUser(null)
    expect(getViewUser()).toBeNull()
  })
})

describe('viewHeaders precedence', () => {
  it('is empty when nothing is set (→ home)', () => {
    expect(viewHeaders()).toEqual({})
  })

  it('emits X-Oto-Org and X-Oto-Group together', () => {
    setViewOrg('42')
    setViewGroup('7')
    expect(viewHeaders()).toEqual({ 'X-Oto-Org': '42', 'X-Oto-Group': '7' })
  })

  it('emits only X-Oto-Org when no group is consulted', () => {
    setViewOrg('42')
    expect(viewHeaders()).toEqual({ 'X-Oto-Org': '42' })
  })

  it('view-as wins: only X-Oto-View-As, never a stale view-org', () => {
    // On force une résidualité en écrivant les clés brutes, puis on pose le view-as.
    localStorage.setItem('oto_view_org', '42')
    localStorage.setItem('oto_view_group', '7')
    localStorage.setItem('oto_view_user', JSON.stringify({ sub: 'u1', name: 'Alice' }))
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u1' })
  })
})
