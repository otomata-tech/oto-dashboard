// Le geste « ajouter un compte » (oto-dashboard#121), vu de la COUTURE.
//
// `ConnectorKeyAccounts` recharge sa liste sur le profil (`watch(me, load)`) : ce test
// vérifie l'autre moitié du fil, sans laquelle la première n'est qu'une intention —
// que le geste, une fois le credential posé, recharge bien `me`. Le dialogue est
// hébergé par `ConnectorScopeView`, à côté du panneau : rien d'autre ne signale la
// pose aux deux vues (la liste des comptes, la pile de provenance).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserAdapter } from './useUserAdapter'
import { useMe } from '@/composables/useMe'
import type { CredentialDialogSpec, ScopeCtx } from './adapter'
import type { MyConnector } from '@/types/api'

const setCredential =
  vi.fn(async (_provider: string, _fields: Record<string, string>, _account?: string) => ({}))
const setOrgSecret = vi.fn(
  async (_id: number, _provider: string, _key: string,
         _baseUrl?: string, _fields?: Record<string, string>) => ({}))
const getMe = vi.fn(async () => ({ sub: 'u', providers: {} }))

vi.mock('@/api/console', () => ({
  getMyConnectors: vi.fn(async () => ({ connectors: [] })),
  getTools: vi.fn(async () => ({ tools: [] })),
  getToolRegistry: vi.fn(async () => ({ tools: [], count: 0 })),
  getAgentToolbox: vi.fn(async () => ({ available: false })),
  getOrgFieldFilters: vi.fn(async () => null),
  credentialPrefill: vi.fn(async () => ({ existing: false, values: {} })),
  setCredential: (p: string, f: Record<string, string>, a?: string) => setCredential(p, f, a),
  setOrgSecret: (i: number, p: string, k: string, b?: string, f?: Record<string, string>) =>
    setOrgSecret(i, p, k, b, f),
  deleteApiKey: vi.fn(async () => ({})),
  verifyConnector: vi.fn(async () => ({ ok: true })),
  enableTool: vi.fn(async () => ({})),
  disableTool: vi.fn(async () => ({})),
  selectConnector: vi.fn(async () => ({})),
  pauseConnector: vi.fn(async () => ({})),
  unselectConnector: vi.fn(async () => ({})),
  getMe: () => getMe(),
}))

const SLACK = {
  name: 'slack', label: 'Slack', state: 'active', namespaces: ['slack'],
  credential_fields: [{ name: 'bot_token', label: 'Bot token', secret: true, required: true }],
  auth: { method: 'secret', cardinality: 'multi_account', account_noun: 'workspace', fields: [] },
} as unknown as MyConnector

describe('useUserAdapter — ajouter un compte nommé (#121)', () => {
  let opened: CredentialDialogSpec | null
  let ctx: ScopeCtx

  beforeEach(() => {
    opened = null
    setCredential.mockClear()
    getMe.mockClear()
    useMe().me.value = null
    ctx = {
      openForm: () => {},
      openCredential: (spec) => { opened = spec },
      confirmAction: async () => true,
      toast: () => {},
    }
  })

  it('demande le nom du compte, avec le mot du registre et les noms déjà posés', () => {
    useUserAdapter(ctx).connection!.addAccount!(SLACK, ['principal'])

    expect(opened).not.toBeNull()
    expect(opened!.accountMode).toBe('new')
    expect(opened!.accountNoun).toBe('workspace')
    expect(opened!.accountNames).toEqual(['principal'])
    // Un compte NEUF n'a rien à conserver : pré-remplir ferait croire qu'un secret
    // laissé vide serait gardé, alors qu'il n'y en a aucun à ce compte-là.
    expect(opened!.existing).toBeUndefined()
  })

  it('pose le credential SOUS le nom donné, puis recharge le profil', async () => {
    useUserAdapter(ctx).connection!.addAccount!(SLACK, [])
    await opened!.onConfirm({ bot_token: 'xoxb-42' }, 'client-x')

    expect(setCredential).toHaveBeenCalledWith('slack', { bot_token: 'xoxb-42' }, 'client-x')
    // Le rechargement de `me` EST le signal que la liste des comptes et la pile de
    // provenance écoutent — sans lui, les deux restent sur leur instantané de montage.
    expect(getMe).toHaveBeenCalled()
  })
})

// oto-backend#868 — un `unselect` refusé (rien à retirer) ne doit plus se lire
// localement comme un retrait réussi.
describe('useUserAdapter — un unselect refusé ne ment pas à l’écran', () => {
  it('un DELETE refusé par le serveur laisse la ligne dans son état ET toast', async () => {
    const { unselectConnector } = await import('@/api/console')
    vi.mocked(unselectConnector).mockRejectedValueOnce(new Error('404 connector_not_selected'))
    const toasted: string[] = []
    const ctx: ScopeCtx = {
      openForm: () => {}, openCredential: () => {}, confirmAction: async () => true,
      toast: (m) => { toasted.push(m) },
    }
    const row = { ...SLACK, state: 'active' } as unknown as MyConnector
    await useUserAdapter(ctx).availability!.set(row, 'off')

    // La ligne locale n'a PAS bougé : le serveur n'a rien retiré.
    expect(row.state).toBe('active')
    expect(toasted).toHaveLength(1)
  })
})

// ── La PROPRIÉTÉ : posé depuis l'écran d'une org, un credential part au palier de
// CETTE org ─────────────────────────────────────────────────────────────────────
//
// Ce que ce bloc vérifie n'est pas « ce formulaire envoie cette valeur » : c'est que
// le palier de la pose SUIT ce que le connecteur déclare accepter. `/connectors` est
// l'écran du membre, mais son contexte est une org (ADR 0033 : la clé membre est déjà
// posée DANS l'org de contexte) — donc pour un connecteur qui n'accepte pas de clé
// personnelle, la seule pose possible est celle de l'org, et elle porte l'org qui est
// déjà à l'écran. L'utilisateur n'a pas à déclarer deux fois où il se trouve.
//
// D'où ça vient : `http` — donc TOUS les ponts clients (ADR 0003/0037) — est
// `byo_org` sans `byo_user`. Le panneau de connexion offrait « Connecter HTTP », le
// geste postait sur `/api/settings/api-keys/http` (palier membre, le seul que cette
// route connaisse), et le serveur répondait `404 unknown_provider : « Connecteur
// inconnu : http »` quelle que soit la saisie. Mesuré sur manage.oto.cx le 08/09/2026.
const HTTP = {
  name: 'http', label: 'HTTP', state: 'active', namespaces: ['http'],
  auth_modes: ['byo_org'],
  credential_fields: [
    { name: 'base_url', label: 'URL de base', secret: false, required: true },
    { name: 'auth_mode', label: "Mode d'auth", secret: false, required: true },
    { name: 'token', label: 'Token', secret: true, when: ['bearer'] },
  ],
  auth: { method: 'secret', cardinality: 'multi_account', field_discriminator: 'auth_mode', fields: [] },
} as unknown as MyConnector

const PENNYLANE = {
  name: 'pennylane', label: 'Pennylane', state: 'active', namespaces: ['pennylane'],
  auth_modes: ['byo_user', 'byo_org'],
  credential_fields: [
    { name: 'api_key', label: 'Clé API', secret: true, required: true },
    { name: 'base_url', label: 'URL', secret: false, required: false },
  ],
  auth: { method: 'secret', cardinality: 'single', fields: [] },
} as unknown as MyConnector

describe("palier de pose depuis l'écran d'une org", () => {
  let opened: CredentialDialogSpec | null
  let ctx: ScopeCtx
  let toasts: string[]

  const commeAdminDeLOrg302 = () => {
    useMe().me.value = {
      sub: 'u', active_org: 302, org_role: 'org_admin', providers: {},
    } as unknown as NonNullable<ReturnType<typeof useMe>['me']['value']>
  }

  beforeEach(() => {
    opened = null
    toasts = []
    setCredential.mockClear()
    setOrgSecret.mockClear()
    useMe().me.value = null
    ctx = {
      openForm: () => {},
      openCredential: (spec) => { opened = spec },
      confirmAction: async () => true,
      toast: (m) => { toasts.push(m) },
    }
  })

  it("un connecteur sans clé personnelle part au palier de l'org À L'ÉCRAN", async () => {
    commeAdminDeLOrg302()
    await useUserAdapter(ctx).connection!.configureKey!(HTTP)
    await opened!.onConfirm({ base_url: 'https://api.acme.com', auth_mode: 'bearer', token: 'x' }, '')

    // Le palier de l'org, et l'org DÉJÀ à l'écran — pas une org redemandée.
    expect(setOrgSecret).toHaveBeenCalledWith(
      302, 'http', '', undefined,
      { base_url: 'https://api.acme.com', auth_mode: 'bearer', token: 'x' })
    // La route du palier membre n'est PAS touchée : c'est elle qui rendait 404.
    expect(setCredential).not.toHaveBeenCalled()
  })

  it('le dialogue ANNONCE le palier avant qu\'on valide', async () => {
    commeAdminDeLOrg302()
    await useUserAdapter(ctx).connection!.configureKey!(HTTP)
    // Sans ça, l'écran promet « ta clé, scopée à l'org courante » — donc « la mienne »
    // — au moment même où il pose la clé de TOUTE l'org.
    expect(opened!.scope).toBe('org')
  })

  it('un connecteur qui accepte une clé perso reste au palier membre', async () => {
    commeAdminDeLOrg302()
    await useUserAdapter(ctx).connection!.configureKey!(PENNYLANE)
    await opened!.onConfirm({ api_key: 'pk-1' }, '')

    expect(setCredential).toHaveBeenCalledWith('pennylane', { api_key: 'pk-1' }, '')
    expect(setOrgSecret).not.toHaveBeenCalled()
    expect(opened!.scope ?? 'member').toBe('member')
  })

  it("un membre non admin ne reçoit pas un formulaire que le serveur refusera", async () => {
    useMe().me.value = {
      sub: 'u', active_org: 302, org_role: 'member', providers: {},
    } as unknown as NonNullable<ReturnType<typeof useMe>['me']['value']>
    await useUserAdapter(ctx).connection!.configureKey!(HTTP)

    expect(opened).toBeNull()
    // Et on dit POURQUOI : un formulaire qui ne s'ouvre pas sans un mot est un bug.
    expect(toasts.join(' ')).toMatch(/org/i)
  })
})

// La borne du geste doit être celle du SERVEUR, pas une plus étroite : côté backend,
// `roles.is_platform_admin` = super_admin SEUL escalade en org_admin. Un super_admin
// qui consulte l'org doit donc pouvoir poser, et un `admin` opérationnel — qui serait
// refusé en 403 — ne doit pas se voir offrir le formulaire.
describe("qui peut poser la clé d'org depuis l'écran du membre", () => {
  const ouvre = async (role: string, orgRole: string | null) => {
    let opened: CredentialDialogSpec | null = null
    const toasts: string[] = []
    useMe().me.value = {
      sub: 'u', active_org: 302, org_role: orgRole, role, providers: {},
    } as unknown as NonNullable<ReturnType<typeof useMe>['me']['value']>
    await useUserAdapter({
      openForm: () => {}, openCredential: (s) => { opened = s },
      confirmAction: async () => true, toast: (m) => { toasts.push(m) },
    }).connection!.configureKey!(HTTP)
    return { opened: opened as CredentialDialogSpec | null, toasts }
  }

  it('un super_admin qui consulte une org peut poser', async () => {
    expect((await ouvre('super_admin', null)).opened).not.toBeNull()
  })
  it("un admin opérationnel ne le peut pas — le serveur le refuserait", async () => {
    expect((await ouvre('admin', null)).opened).toBeNull()
  })
  it("l'admin de l'org le peut", async () => {
    expect((await ouvre('member', 'org_admin')).opened).not.toBeNull()
  })
})

// oto#166 — la provenance de l'installation, dite au membre. « Posé par le kit de ton
// organisation » n'est pas « installé par toi » : la ligne ET la fiche le disent.
describe('useUserAdapter — provenance de l\'installation', () => {
  const ctx: ScopeCtx = {
    openForm: () => {}, openCredential: () => {}, confirmAction: async () => true, toast: () => {},
  }
  const avec = (origin: string | null, state = 'active') =>
    ({ ...SLACK, origin, state }) as unknown as MyConnector
  beforeEach(() => { useMe().me.value = null })

  it('posé par le kit : badge sur la ligne et dans la fiche', () => {
    const a = useUserAdapter(ctx)
    expect(a.cell(avec('kit'), 'etat')?.badge?.text).toBe('installé par ton organisation')
    expect(a.badge?.(avec('kit'))?.text).toBe('installé par ton organisation')
  })

  it('ouvert par un administrateur : badge sur la ligne', () => {
    expect(useUserAdapter(ctx).cell(avec('admin'), 'etat')?.badge?.text).toBe('ouvert par un administrateur')
  })

  it('installé par soi : aucun badge, le verdict reste seul', () => {
    const c = useUserAdapter(ctx).cell(avec('membre'), 'etat')
    expect(c?.badge).toBeUndefined()
    expect(c?.label).toBeTruthy()
  })
})

// oto#166 — « je l'ai installé, pourquoi mon agent ne l'a pas ? » : la ligne porte la
// raison servie par la poignée de main, et la fiche la dit en phrase.
describe('useUserAdapter — installé, mais invisible pour l\'agent', () => {
  const ctx: ScopeCtx = {
    openForm: () => {}, openCredential: () => {}, confirmAction: async () => true, toast: () => {},
  }
  const HUNTER = { ...SLACK, name: 'hunter', label: 'Hunter', namespaces: ['hunter'], state: 'active', origin: 'kit' } as unknown as MyConnector
  const SERPER = { ...SLACK, name: 'serper', label: 'Serper', namespaces: ['serper'], state: 'active', origin: 'membre' } as unknown as MyConnector
  const VUE = {
    org_id: 42, available: true, tools: ['serper_search'], tools_total: 9, spine_tools: 0,
    connectors: [{ name: 'serper', label: 'Serper', tools: 1, origin: 'membre' }],
    installed_not_seen: [{ name: 'hunter', label: 'Hunter', state: 'active', origin: 'kit', reason: 'cut' }],
  }

  async function charger(vue: unknown, echec = false) {
    const api = await import('@/api/console')
    vi.mocked(api.getMyConnectors).mockResolvedValueOnce({ connectors: [HUNTER, SERPER] } as never)
    if (echec) vi.mocked(api.getAgentToolbox).mockRejectedValueOnce(new Error('500 internal'))
    else vi.mocked(api.getAgentToolbox).mockResolvedValueOnce(vue as never)
    const a = useUserAdapter(ctx)
    await a.load()
    return a
  }
  beforeEach(() => { useMe().me.value = null })

  it('la ligne coupée porte sa raison, la ligne vue n\'en porte aucune', async () => {
    const a = await charger(VUE)
    const [hunter, serper] = a.rows.value
    expect(a.cell(hunter!, 'etat')?.sub).toBe('ton agent ne le voit pas — coupé pour ton organisation')
    expect(a.cell(serper!, 'etat')?.sub).toBeUndefined()
  })

  it('la fiche le dit en phrase', async () => {
    const a = await charger(VUE)
    expect(a.availability!.state(a.rows.value[0]!).note)
      .toBe('installé, mais ton agent ne le voit pas — coupé pour ton organisation ; il reviendra seul à sa réouverture.')
  })

  it('available:false — aucune ligne ne se dit invisible', async () => {
    const a = await charger({ org_id: 42, available: false })
    expect(a.cell(a.rows.value[0]!, 'etat')?.sub).toBeUndefined()
    expect(a.error.value).toBeNull()
  })

  it('la vue en échec : la liste reste, et l\'échec se dit', async () => {
    const a = await charger(null, true)
    expect(a.rows.value).toHaveLength(2)
    expect(a.error.value).toBeTruthy()
    expect(a.cell(a.rows.value[0]!, 'etat')?.sub).toBeUndefined()
  })
})
