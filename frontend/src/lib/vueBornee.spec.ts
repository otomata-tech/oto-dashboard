// La vue BORNÉE d'un org_admin (oto#270) : l'org figée à l'entrée part sur CHAQUE requête,
// jamais l'écriture ; ce que le serveur y refuse ne part pas, n'a pas de porte dans le menu,
// et une adresse directe retombe sur l'aperçu. Une seule liste (`lib/vueBornee`) décide.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptViewAsWrite, setViewUser, setViewOrgId, viewHeaders } from './viewOrg'
import {
  estHorsVue, horsVueVide, lectureHorsVue, sectionHorsVue, SECTIONS_HORS_VUE,
} from './vueBornee'
import { NAV, navItemVisible } from './consoleNav'
import { api, ApiError } from '@/api'

const BORNEE = { sub: 'u-bob', name: 'Bob', org: { id: 42, name: 'ACME' } }
const DROITS = { superAdmin: false, seesOrgAdministration: true, orgAdmin: true }
const chemins = () => NAV.flatMap((g) => g.items.filter((it) => navItemVisible(it, DROITS)).map((it) => it.path))

beforeEach(() => { localStorage.clear(); setViewOrgId(null) })
afterEach(() => { setViewUser(null); vi.unstubAllGlobals() })

describe('les en-têtes de la vue bornée', () => {
  it('portent la cible ET son org, même si l’URL consulte une autre org', () => {
    setViewUser(BORNEE)
    setViewOrgId('77')
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u-bob', 'X-Oto-Org': '42' })
  })

  it('ne s’ouvrent jamais à l’écriture', () => {
    setViewUser(BORNEE)
    acceptViewAsWrite()
    expect(viewHeaders()['X-Oto-View-As-Write']).toBeUndefined()
  })

  it('la vue d’opérateur, elle, reste sans org', () => {
    setViewUser({ sub: 'u-bob', name: 'Bob', operator: { name: 'Op', superAdmin: true } })
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u-bob' })
  })
})

describe('ce qui est hors de la vue', () => {
  it('rien n’est masqué hors vue bornée', () => {
    expect(sectionHorsVue('/org/billing')).toBe(false)
    expect(lectureHorsVue('/api/me/tokens')).toBe(false)
    expect(chemins()).toContain('/org/billing')
  })

  it('en vue bornée, le menu n’a plus de porte vers les écrans refusés', () => {
    setViewUser(BORNEE)
    const visibles = chemins()
    for (const s of SECTIONS_HORS_VUE) expect(visibles.filter((p) => p.startsWith(s))).toEqual([])
    expect(visibles).toContain('/projects')
    expect(visibles).toContain('/org')
  })

  it('une adresse d’écran refusé est reconnue par sa section (la garde du routeur la lit)', () => {
    setViewUser(BORNEE)
    expect(sectionHorsVue('/platform/users')).toBe(true)
    expect(sectionHorsVue('/account/developers')).toBe(true)
    expect(sectionHorsVue('/account')).toBe(false)
    expect(sectionHorsVue('/org')).toBe(false)
  })

  it('les lectures refusées sont reconnues, le catalogue de plans reste servi', () => {
    setViewUser(BORNEE)
    expect(lectureHorsVue('/api/me/connector-instances')).toBe(true)
    expect(lectureHorsVue('/api/me/billing/invoices?limit=5')).toBe(true)
    expect(lectureHorsVue('/api/admin/users')).toBe(true)
    expect(lectureHorsVue('/api/billing/plans')).toBe(false)
    expect(lectureHorsVue('/api/me/connectors?verbose=true')).toBe(false)
    expect(lectureHorsVue('/api/datastores')).toBe(false)
  })

  it('une lecture refusée ne part pas : même refus que le serveur', async () => {
    setViewUser(BORNEE)
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const e = await api('/api/me/tokens').catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(estHorsVue(e)).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('une liste dont l’absence est la réponse de la vue rend vide ; toute autre erreur remonte', async () => {
    const vide = await horsVueVide(Promise.reject(new ApiError(403, 'view_as_hors_org')), [] as number[])
    expect(vide).toEqual([])
    await expect(horsVueVide(Promise.reject(new ApiError(500, 'boom')), [])).rejects.toThrow('500 boom')
  })
})
