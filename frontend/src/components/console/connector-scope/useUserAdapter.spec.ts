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
const getMe = vi.fn(async () => ({ sub: 'u', providers: {} }))

vi.mock('@/api/console', () => ({
  getMyConnectors: vi.fn(async () => ({ connectors: [] })),
  getTools: vi.fn(async () => ({ tools: [] })),
  getToolRegistry: vi.fn(async () => ({ tools: [], count: 0 })),
  getOrgFieldFilters: vi.fn(async () => null),
  credentialPrefill: vi.fn(async () => ({ existing: false, values: {} })),
  setCredential: (p: string, f: Record<string, string>, a?: string) => setCredential(p, f, a),
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
