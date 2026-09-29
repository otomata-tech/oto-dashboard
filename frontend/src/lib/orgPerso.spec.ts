// « L'org ne montre que l'org » (oto#160 ; Alexis, 28–29/09/2026) : les lentilles « moi »
// — ce qui est partagé à moi en personne — ne se lisent que dans l'org perso. Ailleurs
// elles ne partent pas du tout : le serveur les refusera, et une section « partagé avec
// moi » vide ou en erreur n'a rien à faire dans une org.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const appels = vi.hoisted(() => ({ liste: [] as string[], refus: null as unknown }))
vi.mock('@/api', () => ({
  api: vi.fn(async (chemin: string, init?: { body?: string }) => {
    const corps = init?.body ? JSON.parse(init.body) : null
    appels.liste.push(corps ? `${chemin} ${corps.op}${corps.scope ? `:${corps.scope}` : ''}` : chemin)
    if (appels.refus) throw appels.refus
    if (chemin === '/api/me/datastores/shared') return { datastores: [{ id: 9 }] }
    if (corps?.op === 'shared_with_me') return { docs: [{ id: 3 }], count: 1, scope: corps.scope }
    return { projects: [{ id: 5 }] }
  }),
  apiDownload: vi.fn(), apiUpload: vi.fn(), apiPublic: vi.fn(),
}))

import { getSharedWithMe, listProjects, listSharedDocs } from '@/api/console'
import { CODE_HORS_ORG_PERSO, enOrgPerso, estHorsOrgPerso, lentilleMoi, poserOrgPerso } from './orgPerso'

const ORG = { active_org_is_personal: false }
const PERSO = { active_org_is_personal: true }
const lentilles = () => Promise.all([getSharedWithMe(), listProjects('me'), listSharedDocs('me')])

beforeEach(() => {
  appels.liste.length = 0
  appels.refus = null
  poserOrgPerso(null)
})

describe('les lentilles « moi » ne se lisent que dans l’org perso', () => {
  it('dans une org non perso : aucun appel, et chacune rend le vide', async () => {
    poserOrgPerso(ORG)
    const [tableaux, projets, pages] = await lentilles()
    expect(appels.liste).toEqual([])
    expect(tableaux.datastores).toEqual([])
    expect(projets.projects).toEqual([])
    expect(pages.docs).toEqual([])
  })

  it('dans l’org perso : les trois partent et rendent ce que le serveur sert', async () => {
    poserOrgPerso(PERSO)
    const [tableaux, projets, pages] = await lentilles()
    expect(appels.liste.sort()).toEqual(
      ['/api/me/datastores/shared', '/api/me/docs shared_with_me:me', '/api/me/projects list:me'])
    expect(tableaux.datastores).toHaveLength(1)
    expect(projets.projects).toHaveLength(1)
    expect(pages.docs).toHaveLength(1)
  })

  it('tant que /api/me n’est pas lu, rien ne part', async () => {
    await lentilles()
    expect(appels.liste).toEqual([])
  })

  it('ce qui est À l’org reste lu partout : sa liste de projets, ses pages partagées', async () => {
    poserOrgPerso(ORG)
    await Promise.all([listProjects(), listSharedDocs('org')])
    expect(appels.liste.sort()).toEqual(['/api/me/docs shared_with_me:org', '/api/me/projects list'])
  })

  it('le refus déclaré du serveur, quel que soit son statut, rend le vide — pas une erreur', async () => {
    poserOrgPerso(PERSO)
    for (const status of [403, 409, 400]) {
      appels.refus = { status, code: CODE_HORS_ORG_PERSO }
      await expect(getSharedWithMe()).resolves.toEqual({ datastores: [] })
    }
  })

  it('une AUTRE erreur remonte : une panne ne se déguise pas en « rien ici »', async () => {
    poserOrgPerso(PERSO)
    appels.refus = { status: 500, code: 'internal' }
    await expect(getSharedWithMe()).rejects.toMatchObject({ status: 500 })
  })
})

describe('la règle', () => {
  it('seule l’org perso servie comme telle compte', () => {
    expect(enOrgPerso(PERSO)).toBe(true)
    expect(enOrgPerso(ORG)).toBe(false)
    expect(enOrgPerso({})).toBe(false)
    expect(enOrgPerso(null)).toBe(false)
  })
  it('le refus se reconnaît à son code seul', () => {
    expect(estHorsOrgPerso({ status: 409, code: CODE_HORS_ORG_PERSO })).toBe(true)
    expect(estHorsOrgPerso({ status: 403, code: 'view_as_hors_org' })).toBe(false)
    expect(estHorsOrgPerso(null)).toBe(false)
  })
  it('lentilleMoi n’appelle pas sa lecture hors de l’org perso', async () => {
    poserOrgPerso(ORG)
    const lire = vi.fn(async () => 1)
    await expect(lentilleMoi(lire, 0)).resolves.toBe(0)
    expect(lire).not.toHaveBeenCalled()
  })
})
