import { describe, expect, it } from 'vitest'
import { exposureFlagsOf, exposureRowsOf, linkedTablesOf } from './projectExposure'
import type { Project, ProjectLink } from '../types/api'

const link = (o: Partial<ProjectLink>): ProjectLink => ({ target_type: 'tableau', target_ref: '1', ...o }) as ProjectLink

describe('linkedTablesOf', () => {
  it('ne garde que les liens de type tableau', () => {
    const p: Pick<Project, 'links'> = { links: [link({}), link({ target_type: 'procedure' })] }
    expect(linkedTablesOf(p)).toHaveLength(1)
  })
  it('un projet sans lien ne promet aucun tableau', () => {
    expect(linkedTablesOf({})).toEqual([])
  })
})

describe('exposureFlagsOf', () => {
  it('⚠️ l’écriture est TOUJOURS subordonnée à la lecture — un flag write orphelin (backend legacy) ne doit jamais se lire comme actif', () => {
    const p = { mcp_expose_docs: false, mcp_expose_datastore: false, mcp_expose_datastore_write: true } as Project
    expect(exposureFlagsOf(p).datastoreWrite).toBe(false)
  })
  it('lecture + écriture posées ensemble', () => {
    const p = { mcp_expose_docs: true, mcp_expose_datastore: true, mcp_expose_datastore_write: true } as Project
    expect(exposureFlagsOf(p)).toEqual({ docs: true, datastoreRead: true, datastoreWrite: true })
  })
  it('flags absents (projet jamais publié) → tout fermé, pas une exception', () => {
    expect(exposureFlagsOf({})).toEqual({ docs: false, datastoreRead: false, datastoreWrite: false })
  })
})

describe('exposureRowsOf', () => {
  it('pages fermées → phrase qui dit explicitement l’absence, pas un vide', () => {
    const { docs } = exposureRowsOf({ docs: false, datastoreRead: false, datastoreWrite: false }, 0)
    expect(docs.sentence).toMatch(/aucune page/)
    expect(docs.disabledReason).toBeNull()
  })
  it('aucun tableau lié → lecture non actionnable, avec la raison', () => {
    const { datastoreRead } = exposureRowsOf({ docs: false, datastoreRead: false, datastoreWrite: false }, 0)
    expect(datastoreRead.disabledReason).toBe('aucun tableau lié à ce projet')
  })
  it('lecture fermée → écriture non actionnable, avec la raison', () => {
    const { datastoreWrite } = exposureRowsOf({ docs: false, datastoreRead: false, datastoreWrite: false }, 3)
    expect(datastoreWrite.disabledReason).toBe('active d’abord la lecture')
  })
  it('lecture ouverte sur plusieurs tableaux → la phrase les compte au pluriel', () => {
    const { datastoreRead } = exposureRowsOf({ docs: false, datastoreRead: true, datastoreWrite: false }, 2)
    expect(datastoreRead.sentence).toContain('les 2 tableaux liés')
  })
  it('lecture ouverte sur un seul tableau → singulier', () => {
    const { datastoreRead } = exposureRowsOf({ docs: false, datastoreRead: true, datastoreWrite: false }, 1)
    expect(datastoreRead.sentence).toContain('le tableau lié')
  })
})
