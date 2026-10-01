// La sonde qui suit l'ajout (ou le remplacement) d'un compte nommé vise CE compte, à
// tous les paliers. Au palier membre elle partait sans compte : dès deux comptes nommés
// sans défaut, la cascade ne savait pas lequel tester et le serveur refusait — l'écran
// n'en lisait que « Failed to fetch » (vécu 01/10, Pennylane multi-sociétés).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyConnector = vi.fn(async () => ({ ok: true, provider: 'pennylane' }))
vi.mock('@/api/console', () => ({ verifyConnector: (...a: unknown[]) => verifyConnector(...(a as [])) }))

import { openAddAccount, openReplaceAccount } from './addAccount'
import type { ConnectorMeta } from '@/types/api'

const CONNECTEUR = {
  name: 'pennylane', label: 'Pennylane', verifiable: true,
  credential_fields: [{ name: 'api_key', label: 'Clé', secret: true }],
} as unknown as ConnectorMeta

function ctxCapturant() {
  const specs: Array<{ verify?: (account: string) => Promise<unknown> }> = []
  const ctx = { openCredential: (s: never) => specs.push(s), toast: () => {} } as never
  return { ctx, specs }
}

const opts = (scope: 'member' | 'org') => ({ scope, save: async () => {}, reload: async () => {} })

describe('addAccount — la sonde nomme le compte', () => {
  beforeEach(() => verifyConnector.mockClear())

  it('ajout au palier membre : sonde auto sur le compte saisi', async () => {
    const { ctx, specs } = ctxCapturant()
    openAddAccount(ctx, CONNECTEUR, ['compte-a'], opts('member'))
    await specs[0]!.verify!('compte-b')
    expect(verifyConnector).toHaveBeenCalledWith('pennylane', 'auto', 'compte-b')
  })

  it('ajout au palier org : sonde org sur le compte saisi', async () => {
    const { ctx, specs } = ctxCapturant()
    openAddAccount(ctx, CONNECTEUR, [], opts('org'))
    await specs[0]!.verify!('compte-c')
    expect(verifyConnector).toHaveBeenCalledWith('pennylane', 'org', 'compte-c')
  })

  it('remplacement au palier membre : sonde auto sur le compte remplacé', async () => {
    const { ctx, specs } = ctxCapturant()
    openReplaceAccount(ctx, CONNECTEUR, 'compte-a', opts('member'))
    await specs[0]!.verify!('')
    expect(verifyConnector).toHaveBeenCalledWith('pennylane', 'auto', 'compte-a')
  })
})
