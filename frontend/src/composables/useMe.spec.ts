// Qui est admin d'org pour l'écran, rôle par rôle — et ce que le menu en montre (oto#210).
//
// Côté serveur (oto-backend, relu sur origin/main le 13/09) : `roles.is_org_admin` = l'org_admin
// de l'org, ou le super_admin. L'`admin` plateforme n'y est JAMAIS : chaque op d'admin d'org le
// refuse en 403. Il LIT pourtant les écrans d'administration (en consultation,
// `effective_org_role` le tient pour membre) — sauf la supervision d'org, dont les lectures
// sont elles-mêmes `ORG_ADMIN_OF`.
import { describe, expect, it } from 'vitest'
import { isOrgAdmin, isSuperAdmin, seesOrgAdministration } from './useMe'
import { NAV, navItemVisible } from '@/lib/consoleNav'
import { droits } from '@/lib/runnerGestes'

const ORG_ADMIN = { role: 'member', org_role: 'org_admin' } as const
const MEMBRE = { role: 'member', org_role: 'org_member' } as const
const ADMIN_MEMBRE = { role: 'admin', org_role: 'org_member' } as const
const ADMIN_CONSULTANT = { role: 'admin', org_role: null } as const
const SUPER_ADMIN = { role: 'super_admin', org_role: null } as const
type Porteur = { role: 'member' | 'admin' | 'super_admin'; org_role: 'org_admin' | 'org_member' | null }

const ROLES: [string, Porteur][] = [
  ['org_admin', ORG_ADMIN],
  ['membre simple', MEMBRE],
  ["admin plateforme, membre de l'org", ADMIN_MEMBRE],
  ["admin plateforme qui consulte l'org", ADMIN_CONSULTANT],
  ['super_admin', SUPER_ADMIN],
]

describe("isOrgAdmin — l'admin d'org tel que le serveur le tient", () => {
  it.each([
    ['org_admin', ORG_ADMIN, true],
    ['membre simple', MEMBRE, false],
    ["admin plateforme, membre de l'org", ADMIN_MEMBRE, false],
    ["admin plateforme qui consulte l'org", ADMIN_CONSULTANT, false],
    ['super_admin', SUPER_ADMIN, true],
  ])('%s → %s', (_nom, m, attendu) => {
    expect(isOrgAdmin(m)).toBe(attendu)
  })

  it('sans profil chargé, personne', () => {
    expect(isOrgAdmin(null)).toBe(false)
  })
})

describe("seesOrgAdministration — qui voit les écrans d'administration d'org", () => {
  it.each([
    ['org_admin', ORG_ADMIN, true],
    ['membre simple', MEMBRE, false],
    ["admin plateforme, membre de l'org", ADMIN_MEMBRE, true],
    ["admin plateforme qui consulte l'org", ADMIN_CONSULTANT, true],
    ['super_admin', SUPER_ADMIN, true],
  ])('%s → %s', (_nom, m, attendu) => {
    expect(seesOrgAdministration(m)).toBe(attendu)
  })
})

describe("le menu d'org, rôle par rôle", () => {
  const ORG = NAV.find((g) => g.level === 'org')?.items ?? []
  const visibles = (m: Porteur) => ORG
    .filter((it) => navItemVisible(it, {
      superAdmin: isSuperAdmin(m), seesOrgAdministration: seesOrgAdministration(m), orgAdmin: isOrgAdmin(m),
    }))
    .map((it) => it.path)
  const LECTURES_OPERATEUR = ['/org/context', '/org', '/org/settings', '/org/security', '/org/connectors', '/org/teams']
  const TOUT = [...LECTURES_OPERATEUR, '/org/monitoring']

  it.each([
    ['org_admin', ORG_ADMIN, TOUT],
    ['membre simple', MEMBRE, ['/org/context']],
    // Les lectures de ces six écrans lui sont servies ; la supervision lui est refusée même
    // en lecture (`ORG_ADMIN_OF`) : son entrée ne serait qu'une porte fermée.
    ["admin plateforme, membre de l'org", ADMIN_MEMBRE, LECTURES_OPERATEUR],
    ["admin plateforme qui consulte l'org", ADMIN_CONSULTANT, LECTURES_OPERATEUR],
    ['super_admin', SUPER_ADMIN, TOUT],
  ])('%s', (_nom, m, attendu) => {
    expect(visibles(m)).toEqual(attendu)
  })
})

describe("les gestes d'une campagne s'appuient sur la même règle", () => {
  it.each(ROLES)('%s : armer ⇔ hors lecture seule ET isOrgAdmin', (_nom, m) => {
    for (const lectureSeule of [false, true]) {
      const porteur = { ...m, active_org_readonly: lectureSeule }
      expect(droits(porteur).armer).toBe(!lectureSeule && isOrgAdmin(porteur))
    }
  })
})
