// La résolution d'un tableau désigné (oto#160, 29/09/2026) : la liste de l'org, puis la
// lecture par identifiant pour ce qu'elle ne rend pas. `null` = le 404 déclaré, et lui
// seul ; toute autre erreur remonte.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api'
import type { DatastoreEntry } from '@/types/api'

const getDatastore = vi.hoisted(() => vi.fn())
vi.mock('@/api/console', () => ({ getDatastore }))

import { estTableauIntrouvable, resoudreTableau } from './tableauParId'

const t = (id: number, datastore: string): DatastoreEntry => ({
  id, datastore, url: '', shared: false, owner_type: 'org', owner_id: '42',
  is_personal: false, can_write: true, can_govern: true, permission: 'write', schema: null,
} as DatastoreEntry)

beforeEach(() => { getDatastore.mockReset() })

describe('resoudreTableau', () => {
  it('trouvé dans la liste : aucune lecture par identifiant', async () => {
    expect(await resoudreTableau('7', [t(7, 'clients')])).toMatchObject({ id: 7 })
    expect(getDatastore).not.toHaveBeenCalled()
  })

  it('l identifiant l emporte sur un homonyme dont le NOM vaut cet identifiant', async () => {
    const liste = [t(3, '7'), t(7, 'clients')]
    expect(await resoudreTableau('7', liste)).toMatchObject({ id: 7 })
  })

  it('absent de la liste : lu par identifiant, droits servis gardés', async () => {
    getDatastore.mockResolvedValue({ ...t(77, 'recu'), shared: true, permission: 'read', can_write: false })
    const lu = await resoudreTableau('77', [t(7, 'clients')])
    expect(getDatastore).toHaveBeenCalledWith('77')
    expect(lu).toMatchObject({ id: 77, shared: true, permission: 'read', can_write: false })
  })

  it('le 404 déclaré rend null — inconnu ou inaccessible', async () => {
    getDatastore.mockRejectedValue(new ApiError(404, 'datastore_not_found'))
    expect(await resoudreTableau('77', [])).toBeNull()
  })

  it('toute autre erreur remonte, y compris un autre 404', async () => {
    getDatastore.mockRejectedValue(new ApiError(500, 'internal_error'))
    await expect(resoudreTableau('77', [])).rejects.toMatchObject({ status: 500 })
    getDatastore.mockRejectedValue(new ApiError(404, 'not_found'))
    await expect(resoudreTableau('77', [])).rejects.toMatchObject({ code: 'not_found' })
  })

  it('estTableauIntrouvable ne reconnaît que le code déclaré', () => {
    expect(estTableauIntrouvable(new ApiError(404, 'datastore_not_found'))).toBe(true)
    expect(estTableauIntrouvable(new ApiError(404, 'not_found'))).toBe(false)
    expect(estTableauIntrouvable(new Error('x'))).toBe(false)
  })
})
