import { describe, it, expect } from 'vitest'
import { projectBucket, projectVisibility, BUCKET_ORDER, BUCKET_LABEL, BUCKET_HINT } from './projectVisibility'

// La liste d'une org range ce qu'elle REÇOIT à part : un projet partagé à l'org consultée
// par une autre org (ou une autre personne) se lisait comme un projet de celle-ci.
const CTX = { orgId: 42, sub: 'u-moi' }

describe('projectBucket — ranger par propriétaire, rapporté au contexte consulté', () => {
  it.each([
    ['projet de l’org consultée', { owner_type: 'org', owner_id: '42' }, 'org'],
    ['projet d’une AUTRE org, partagé ici', { owner_type: 'org', owner_id: '7' }, 'shared'],
    ['mon projet perso', { owner_type: 'user', owner_id: 'u-moi' }, 'mine'],
    ['projet perso d’une autre personne, partagé ici', { owner_type: 'user', owner_id: 'u-autre' }, 'shared'],
    ['projet d’équipe', { owner_type: 'group', owner_id: '5' }, 'group'],
    ['bibliothèque', { owner_type: 'platform', owner_id: 'platform' }, 'platform'],
  ])('%s → %s', (_quoi, p, attendu) => {
    expect(projectBucket(p, CTX)).toBe(attendu)
  })

  it('compare les identifiants en texte (l’API rend owner_id en chaîne, active_org en nombre)', () => {
    expect(projectBucket({ owner_type: 'org', owner_id: '42' }, { orgId: '42' })).toBe('org')
  })

  it('sans contexte, ne devine pas : le projet reste au rang de son propriétaire', () => {
    expect(projectBucket({ owner_type: 'org', owner_id: '7' })).toBe('org')
    expect(projectBucket({ owner_type: 'user', owner_id: 'u-autre' })).toBe('mine')
  })

  it('chaque rang a sa place, son libellé et son explication', () => {
    expect(BUCKET_ORDER).toEqual(['mine', 'group', 'org', 'shared', 'platform'])
    for (const b of BUCKET_ORDER) {
      expect(BUCKET_LABEL[b]).toBeTruthy()
      expect(BUCKET_HINT[b]).toBeTruthy()
    }
    expect(BUCKET_LABEL.shared).toBe('Partagés avec cette organisation')
  })
})

describe('projectVisibility — un projet reçu ne s’attribue pas à l’org consultée', () => {
  const autreOrg = { owner_type: 'org', shared: true, mcp_access: 'off' as const }

  it('reçu par l’org : nomme l’org consultée comme DESTINATAIRE, pas comme propriétaire', () => {
    const v = projectVisibility(autreOrg, { orgName: 'ACME', received: 'org' })
    expect(v.label).toBe('Partagé ici')
    expect(v.detail).toContain('partagé avec l’organisation ACME')
    expect(v.detail).not.toContain('tous les membres')
  })

  it('reçu en personne', () => {
    expect(projectVisibility(autreOrg, { orgName: 'ACME', received: 'me' }).label).toBe('Partagé avec toi')
  })

  it('non reçu : inchangé', () => {
    expect(projectVisibility(autreOrg, { orgName: 'ACME' }).detail)
      .toBe('Visible par tous les membres de l’organisation ACME.')
  })
})
