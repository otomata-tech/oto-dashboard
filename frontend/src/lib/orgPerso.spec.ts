// Une org perso est une org comme une autre (Alexis, 29/09/2026) : les lentilles « moi » — ce
// qui est partagé à moi en personne — se lisent dans TOUTE org (elles ne partaient que dans
// l'org perso, et le serveur les refusait ailleurs en 409).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const appels = vi.hoisted(() => ({ liste: [] as string[] }))
vi.mock('@/api', () => ({
  api: vi.fn(async (chemin: string, init?: { body?: string }) => {
    const corps = init?.body ? JSON.parse(init.body) : null
    appels.liste.push(corps ? `${chemin} ${corps.op}${corps.scope ? `:${corps.scope}` : ''}` : chemin)
    if (chemin === '/api/me/datastores/shared') return { datastores: [{ id: 9 }] }
    if (corps?.op === 'shared_with_me') return { docs: [{ id: 3 }], count: 1, scope: corps.scope }
    return { projects: [{ id: 5 }] }
  }),
  apiDownload: vi.fn(), apiUpload: vi.fn(), apiPublic: vi.fn(),
}))

import { getSharedWithMe, listProjects, listSharedDocs } from '@/api/console'
import { enOrgPerso } from './orgPerso'

beforeEach(() => {
  appels.liste.length = 0
})

describe('les lentilles « moi » se lisent partout', () => {
  it('les trois partent, sans condition d’org, et rendent ce que le serveur sert', async () => {
    const [tableaux, projets, pages] = await Promise.all(
      [getSharedWithMe(), listProjects('me'), listSharedDocs('me')])
    expect(appels.liste.sort()).toEqual(
      ['/api/me/datastores/shared', '/api/me/docs shared_with_me:me', '/api/me/projects list:me'])
    expect(tableaux.datastores).toHaveLength(1)
    expect(projets.projects).toHaveLength(1)
    expect(pages.docs).toHaveLength(1)
  })
})

describe('l’étiquette', () => {
  it('seule l’org perso servie comme telle compte', () => {
    expect(enOrgPerso({ active_org_is_personal: true })).toBe(true)
    expect(enOrgPerso({ active_org_is_personal: false })).toBe(false)
    expect(enOrgPerso({})).toBe(false)
    expect(enOrgPerso(null)).toBe(false)
  })
})
