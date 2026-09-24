// Les leviers de /org/connectors, rôle par rôle (oto#210).
//
// Côté serveur (oto-backend, relu sur origin/main le 13/09) : disponibilité et clé d'org
// s'écrivent sous `ORG_ADMIN_OF` ; l'autorisation au scope org exige
// `is_org_admin` là où le connecteur la lit. L'admin d'org, pour le serveur, c'est
// l'org_admin et le super_admin — JAMAIS l'`admin` plateforme, à qui les lectures
// (`ORG_MEMBER_OF`, en consultation) restent servies mais chaque écriture refusée en 403.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'

const api = vi.hoisted(() => ({
  getOrgConnectorActivation: vi.fn(), setOrgConnectorActivation: vi.fn(),
  clearOrgConnectorActivation: vi.fn(), getOrgFieldFilters: vi.fn(), getConnectors: vi.fn(),
  getOrg: vi.fn(), setOrgSecret: vi.fn(), deleteOrgSecret: vi.fn(), verifyConnector: vi.fn(),
  startConnectorFlow: vi.fn(), credentialPrefill: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const me = ref<Record<string, unknown> | null>(null)
const reloadMe = vi.fn(async () => {})
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me, reload: reloadMe }),
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
  api.setOrgConnectorActivation.mockResolvedValue({})
})

const TOUS = { disponibilite: true, cle: true, autoriser: true, ecritureEnvoyee: true }
const AUCUN = { disponibilite: false, cle: false, autoriser: false, ecritureEnvoyee: false }

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

// Une clé d'org PAR SOCIÉTÉ (#121 au palier org). Avant ce lot l'adaptateur d'org n'avait
// pas de geste d'ajout : l'admin d'un groupe posait une clé PayFit, et rien ne permettait
// d'en poser une deuxième. Le geste est celui du palier membre (`addAccount.ts`) ; ce que
// ce test tient, c'est ce que l'adaptateur d'org y branche : le palier, la route, le nom.
describe("useOrgAdapter — ajouter une clé d'org nommée", () => {
  const PAYFIT = { connector: 'payfit', label: 'PayFit', effective: true, master_enabled: true }
  // Ce que le catalogue SERT pour PayFit (lu sur la preprod le 18/09) : une clé unique,
  // un seul champ nommé `key`.
  const CHAMPS = [{ name: 'key', label: 'API key', secret: true }]
  type Ajout = {
    load: () => Promise<void>
    credential: { accountScope?: string; addAccount: (r: unknown, existing: string[]) => void }
  }
  type Spec = {
    scope: string; accountMode: string; accountNoun: string; accountNames: string[]
    verify?: unknown
    onConfirm: (values: Record<string, string>, account: string) => Promise<void>
  }

  async function adaptateur(org_role: string, active_org_readonly = false) {
    me.value = { sub: 'u-test', role: 'member', org_role, active_org: 42, active_org_readonly }
    api.getOrgConnectorActivation.mockResolvedValue({ connectors: [PAYFIT] })
    api.getConnectors.mockResolvedValue({ connectors: [{
      name: 'payfit', label: 'PayFit', secret_kind: 'api_key', credential_fields: CHAMPS,
      auth: { cardinality: 'multi_account', account_noun: 'société' },
    }] })
    api.setOrgSecret.mockResolvedValue({ ok: true })
    const a = useOrgAdapter(ctx as never) as unknown as Ajout
    await a.load()
    return a
  }

  it("ouvre le dialogue d'un compte NEUF, au palier org, avec le mot du registre", async () => {
    const a = await adaptateur('org_admin')
    expect(a.credential.accountScope).toBe('org')
    a.credential.addAccount(PAYFIT, ['Société A'])

    expect(ctx.openCredential).toHaveBeenCalledTimes(1)
    const spec = ctx.openCredential.mock.calls[0]![0] as Spec
    expect(spec).toMatchObject({
      scope: 'org', accountMode: 'new', accountNoun: 'société', accountNames: ['Société A'],
    })
  })

  it("écrit par la route de l'org, sous le nom saisi, puis recharge la liste et le profil", async () => {
    const a = await adaptateur('org_admin')
    a.credential.addAccount(PAYFIT, ['Société A'])
    const spec = ctx.openCredential.mock.calls[0]![0] as Spec
    api.getOrgConnectorActivation.mockClear()
    await spec.onConfirm({ key: 'pf-42' }, 'Société B')

    // ⚠️ Clé UNIQUE ⇒ `api_key`, jamais `fields` : le serveur ne lit `fields` que pour un
    // connecteur multi-champs, et refuserait la pose en 400 `empty_api_key`.
    expect(api.setOrgSecret).toHaveBeenCalledWith(42, 'payfit', 'pf-42', undefined, undefined, 'Société B')
    expect(ctx.toast).toHaveBeenCalledWith('société « Société B » ajoutée')
    // `me` rechargé = le signal que la liste des comptes écoute (`watch(me, load)`).
    expect(reloadMe).toHaveBeenCalledTimes(1)
    expect(api.getOrgConnectorActivation).toHaveBeenCalledTimes(1)
  })

  it('un connecteur MULTI-champs part par `fields`, comme sa clé d’org ordinaire', async () => {
    const a = await adaptateur('org_admin')
    api.getConnectors.mockResolvedValue({ connectors: [{
      name: 'payfit', label: 'PayFit', secret_kind: 'fields',
      credential_fields: [{ name: 'bot_token', label: 'Bot', secret: true }, { name: 'user_token', label: 'User', secret: true }],
      auth: { cardinality: 'multi_account', account_noun: 'société' },
    }] })
    await a.load()
    a.credential.addAccount(PAYFIT, [])
    const spec = ctx.openCredential.mock.calls[0]![0] as Spec
    await spec.onConfirm({ bot_token: 'b', user_token: 'u' }, 'Société B')

    expect(api.setOrgSecret).toHaveBeenCalledWith(42, 'payfit', '', undefined, { bot_token: 'b', user_token: 'u' }, 'Société B')
  })

  it('sonde le compte que la pose vient d’écrire, au palier org', async () => {
    const a = await adaptateur('org_admin')
    api.getConnectors.mockResolvedValue({ connectors: [{
      name: 'payfit', label: 'PayFit', secret_kind: 'api_key', credential_fields: CHAMPS, verifiable: true,
      auth: { cardinality: 'multi_account', account_noun: 'société' },
    }] })
    await a.load()
    a.credential.addAccount(PAYFIT, [])
    const spec = ctx.openCredential.mock.calls[0]![0] as Spec
    await (spec.verify as (account: string) => Promise<unknown>)('Société B')
    // Sans `account`, la sonde d'org lirait la ligne anonyme, que le serveur vient de
    // renommer — « aucune clé d'org posée » sur une pose réussie (vécu 18/09).
    expect(api.verifyConnector).toHaveBeenCalledWith('payfit', 'org', 'Société B')
  })

  it('le « tester » du levier vise le compte qu’on lui donne', async () => {
    const a = await adaptateur('org_admin')
    ;(a.credential as unknown as { verify: (r: unknown, account?: string) => Promise<unknown> })
      .verify(PAYFIT, 'Société A')
    expect(api.verifyConnector).toHaveBeenCalledWith('payfit', 'org', 'Société A')
  })

  it.each([
    ['un membre simple', 'org_member', false],
    ["l'admin d'org en consultation", 'org_admin', true],
  ])("%s n'ouvre rien", async (_nom, orgRole, lectureSeule) => {
    const a = await adaptateur(orgRole, lectureSeule)
    a.credential.addAccount(PAYFIT, [])
    expect(ctx.openCredential).not.toHaveBeenCalled()
  })
})
