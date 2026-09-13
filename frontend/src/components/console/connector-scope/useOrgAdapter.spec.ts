// Les leviers de /org/connectors, rôle par rôle (oto#210).
//
// Côté serveur (oto-backend, relu sur origin/main le 13/09) : disponibilité, clé d'org et
// accès réservé s'écrivent sous `ORG_ADMIN_OF` ; l'autorisation au scope org exige
// `is_org_admin` là où le connecteur la lit. L'admin d'org, pour le serveur, c'est
// l'org_admin et le super_admin — JAMAIS l'`admin` plateforme, à qui les lectures
// (`ORG_MEMBER_OF`, en consultation) restent servies mais chaque écriture refusée en 403.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'

const api = vi.hoisted(() => ({
  getOrgConnectorActivation: vi.fn(), setOrgConnectorActivation: vi.fn(),
  clearOrgConnectorActivation: vi.fn(), getOrgFieldFilters: vi.fn(), getConnectors: vi.fn(),
  getOrg: vi.fn(), setOrgSecret: vi.fn(), deleteOrgSecret: vi.fn(), verifyConnector: vi.fn(),
  startConnectorFlow: vi.fn(), getConnectorAcl: vi.fn(), setConnectorAccess: vi.fn(),
  clearConnectorAccess: vi.fn(), listGroups: vi.fn(), credentialPrefill: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const me = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me }),
}))

import { useOrgAdapter } from './useOrgAdapter'

const LIGNE = { connector: 'pennylane', label: 'Pennylane', effective: true, master_enabled: true }
const ctx = { openForm: vi.fn(), openCredential: vi.fn(), confirmAction: vi.fn(async () => true), toast: vi.fn() }

// La surface de l'adaptateur qu'on éprouve ici, sans le typage complet de ses leviers.
type Leviers = {
  rows: Ref<typeof LIGNE[]>
  load: () => Promise<void>
  availability: { canEdit: (r: unknown) => boolean; set: (r: unknown, next: boolean) => Promise<void> }
  credential: {
    canEdit: (r: unknown) => boolean
    canVerify: (r: unknown) => boolean
    connect: { available: (r: unknown) => boolean }
  }
  access: { canEdit: () => boolean }
}

async function leviers(role: string, org_role: string | null, active_org_readonly = false) {
  me.value = { sub: 'u-test', role, org_role, active_org: 42, active_org_readonly }
  const a = useOrgAdapter(ctx as never) as unknown as Leviers
  await a.load()
  const row = a.rows.value[0]!
  await a.availability.set(row, false)
  return {
    disponibilite: a.availability.canEdit(row),
    cle: a.credential.canEdit(row),
    autoriser: a.credential.connect.available(row),
    acces: a.access.canEdit(),
    ecritureEnvoyee: api.setOrgConnectorActivation.mock.calls.length > 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getOrgConnectorActivation.mockResolvedValue({ connectors: [LIGNE] })
  api.getOrgFieldFilters.mockResolvedValue(null)
  api.getConnectors.mockResolvedValue({
    connectors: [{ name: 'pennylane', secret_kind: 'api_key', connect: { label: 'Autoriser' } }],
  })
  api.getOrg.mockResolvedValue({ secrets: [{ provider: 'pennylane' }], members: [] })
  api.getConnectorAcl.mockResolvedValue({ access: [] })
  api.listGroups.mockResolvedValue({ groups: [] })
  api.setOrgConnectorActivation.mockResolvedValue({})
})

const TOUS = { disponibilite: true, cle: true, autoriser: true, acces: true, ecritureEnvoyee: true }
const AUCUN = { disponibilite: false, cle: false, autoriser: false, acces: false, ecritureEnvoyee: false }

describe("useOrgAdapter — les leviers d'org suivent la règle du serveur (oto#210)", () => {
  it.each([
    ['org_admin', 'member', 'org_admin', TOUS],
    ['membre simple', 'member', 'org_member', AUCUN],
    ["admin plateforme, membre de l'org", 'admin', 'org_member', AUCUN],
    ["admin plateforme qui consulte l'org", 'admin', null, AUCUN],
    ['super_admin', 'super_admin', null, TOUS],
  ])('%s', async (_nom, role, orgRole, attendu) => {
    expect(await leviers(role, orgRole)).toEqual(attendu)
  })

  it("les lectures restent chargées pour l'admin plateforme", async () => {
    me.value = { sub: 'u-test', role: 'admin', org_role: null, active_org: 42 }
    const a = useOrgAdapter(ctx as never) as unknown as Leviers
    await a.load()
    expect(a.rows.value).toHaveLength(1)
  })
})

// En consultation (`active_org_readonly`), `ViewAsMiddleware` refuse toute requête non-GET
// dont l'`op` n'est pas une lecture — super_admin compris. « Tester » est un POST sans `op` :
// le serveur le compte comme une écriture, il suit donc la même règle.
describe('useOrgAdapter — en consultation, aucun levier (oto#211)', () => {
  it.each([
    ['org_admin', 'member', 'org_admin'],
    ['super_admin', 'super_admin', null],
  ])('%s : leviers hors consultation, aucun en consultation', async (_nom, role, orgRole) => {
    expect(await leviers(role, orgRole, false)).toEqual(TOUS)
    vi.clearAllMocks()
    expect(await leviers(role, orgRole, true)).toEqual(AUCUN)
  })

  it.each([
    ['org_admin', 'member', 'org_admin'],
    ['membre simple', 'member', 'org_member'],
    ['super_admin', 'super_admin', null],
  ])('%s : « tester » est offert hors consultation seulement', (_nom, role, orgRole) => {
    for (const lectureSeule of [false, true]) {
      me.value = { sub: 'u-test', role, org_role: orgRole, active_org: 42, active_org_readonly: lectureSeule }
      const a = useOrgAdapter(ctx as never) as unknown as Leviers
      expect(a.credential.canVerify(LIGNE)).toBe(!lectureSeule)
    }
  })
})
