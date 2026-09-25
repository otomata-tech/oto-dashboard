// La vue BORNÉE d'un org_admin (oto#270) : l'org choisie à l'entrée part sur CHAQUE requête,
// jamais l'écriture ; ce que le SERVEUR y dit refusé (`/api/me` : `view_as_bound_org`,
// `view_as_refused_prefixes`) ne part pas, n'a pas de porte dans le menu, et une adresse
// directe retombe sur l'aperçu. Le front ne recopie aucune liste du serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptViewAsWrite, setViewUser, setViewOrgId, viewHeaders } from './viewOrg'
import {
  enVueBornee, estHorsVue, horsVueVide, lectureHorsVue, orgDeLaVue, poserVueBornee,
  sectionHorsVue, SECTIONS_HORS_VUE,
} from './vueBornee'
import { NAV, navItemVisible } from './consoleNav'
import { api, ApiError } from '@/api'

const BORNEE = { sub: 'u-bob', name: 'Bob', org: { id: 42, name: 'ACME' } }
// Ce que `/api/me` sert en vue bornée (forme du backend a7e02e4c : préfixes tronqués avant
// le premier paramètre, slash final gardé).
const SERVIE = {
  view_as_bound_org: 42,
  view_as_refused_prefixes: [
    '/api/me/billing', '/api/me/billing/', '/api/me/tokens', '/api/me/model-subscriptions',
    '/api/me/connector-instances', '/api/admin/', '/api/connectors/',
  ],
}
/** Entrer dans la vue comme le fait l'écran : en-têtes posés, puis `/api/me` lu. */
const entrer = () => { setViewUser(BORNEE); poserVueBornee(SERVIE) }
const DROITS = { superAdmin: false, seesOrgAdministration: true, orgAdmin: true }
const chemins = () => NAV.flatMap((g) => g.items.filter((it) => navItemVisible(it, DROITS)).map((it) => it.path))

beforeEach(() => { localStorage.clear(); setViewOrgId(null) })
afterEach(() => { setViewUser(null); poserVueBornee(null); vi.unstubAllGlobals() })

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
    entrer()
    const visibles = chemins()
    for (const s of Object.keys(SECTIONS_HORS_VUE)) expect(visibles.filter((p) => p.startsWith(s))).toEqual([])
    expect(visibles).toContain('/projects')
    expect(visibles).toContain('/org')
  })

  it('une adresse d’écran refusé est reconnue par sa section (la garde du routeur la lit)', () => {
    entrer()
    expect(sectionHorsVue('/platform/users')).toBe(true)
    expect(sectionHorsVue('/account/developers')).toBe(true)
    expect(sectionHorsVue('/account')).toBe(false)
    expect(sectionHorsVue('/org')).toBe(false)
  })

  it('les lectures refusées sont celles que le serveur sert, le catalogue de plans reste ouvert', () => {
    entrer()
    expect(orgDeLaVue()).toBe(42)
    expect(lectureHorsVue('/api/me/connector-instances')).toBe(true)
    expect(lectureHorsVue('/api/me/billing/invoices?limit=5')).toBe(true)
    expect(lectureHorsVue('/api/admin/users')).toBe(true)
    expect(lectureHorsVue('/api/billing/plans')).toBe(false)
    expect(lectureHorsVue('/api/me/connectors?verbose=true')).toBe(false)
    expect(lectureHorsVue('/api/datastores')).toBe(false)
  })

  it('le slash final compte : `/api/connectors/` refusé ne couvre pas `/api/connectors` exact', () => {
    entrer()
    expect(lectureHorsVue('/api/connectors/pennylane/tools')).toBe(true)
    expect(lectureHorsVue('/api/connectors')).toBe(false)
    expect(lectureHorsVue('/api/connectors?kind=all')).toBe(false)
  })

  it('seules les lectures GET sont jugées : une écriture reste au serveur (lecture seule)', () => {
    entrer()
    expect(lectureHorsVue('/api/me/tokens', 'POST')).toBe(false)
    expect(lectureHorsVue('/api/me/tokens', 'get')).toBe(true)
  })

  it('avant la lecture de `/api/me`, rien n’est masqué ni retenu : le serveur reste l’autorité', () => {
    setViewUser(BORNEE)
    expect(enVueBornee()).toBe(false)
    expect(sectionHorsVue('/org/billing')).toBe(false)
    expect(sectionHorsVue('/account/security')).toBe(false)
    expect(lectureHorsVue('/api/me/tokens')).toBe(false)
  })

  it('une vue d’opérateur (`view_as_bound_org: null`) ne masque rien', () => {
    setViewUser({ sub: 'u-bob', name: 'Bob', operator: { name: 'Op', superAdmin: true } })
    poserVueBornee({ view_as_bound_org: null, view_as_refused_prefixes: null })
    expect(enVueBornee()).toBe(false)
    expect(sectionHorsVue('/platform/users')).toBe(false)
  })

  it('un écran n’est masqué que si le serveur refuse la lecture qui le fait vivre', () => {
    setViewUser(BORNEE)
    poserVueBornee({ view_as_bound_org: 42, view_as_refused_prefixes: ['/api/me/tokens'] })
    expect(sectionHorsVue('/account/developers')).toBe(true)
    expect(sectionHorsVue('/org/billing')).toBe(false)
    // La MFA est lue sur Logto pour le compte connecté : règle d'écran, toujours masquée.
    expect(sectionHorsVue('/account/security')).toBe(true)
  })

  it('une lecture refusée ne part pas : même refus que le serveur', async () => {
    entrer()
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
