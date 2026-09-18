// « Tester » dans le panneau credential (oto#211).
//
// La sonde se présente comme une lecture, mais c'est un POST sans `op`
// (`/api/me/connectors/{provider}/verify`) : en consultation, `ViewAsMiddleware` la refuse en
// `403 view_as_read_only`. Le levier dit donc s'il l'offre (`canVerify`) ; un levier qui ne le
// déclare pas l'offre comme avant (fiche personnelle, plateforme).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const api = vi.hoisted(() => ({
  getConnectorIdentities: vi.fn(), setConnectorIdentity: vi.fn(), deleteApiKey: vi.fn(),
  getMe: vi.fn(async () => null),
}))
vi.mock('@/api/console', () => api)

import ConnectorCredentialPanel from './ConnectorCredentialPanel.vue'
import { useMe } from '@/composables/useMe'
import type { Me } from '@/types/api'

function monter(lever: Record<string, unknown>) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(ConnectorCredentialPanel as never, { lever, row: {} }) })
  app.mount(host)
  const boutons = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
  const texte = host.textContent ?? ''
  app.unmount()
  return { boutons, texte }
}

const LEVIER = {
  title: "clé partagée d'org",
  state: () => ({ present: true, label: 'posée' }),
  canEdit: () => false,
  edit: vi.fn(),
  verify: vi.fn(),
}

describe('ConnectorCredentialPanel — « tester » suit le levier', () => {
  it('offert quand le levier ne dit rien', () => {
    expect(monter(LEVIER).boutons).toContain('tester')
  })

  it('offert quand le levier le permet', () => {
    expect(monter({ ...LEVIER, canVerify: () => true }).boutons).toContain('tester')
  })

  it('omis quand le levier le refuse (consultation), et le panneau se dit en lecture seule', () => {
    const { boutons, texte } = monter({ ...LEVIER, canVerify: () => false })
    expect(boutons).not.toContain('tester')
    expect(texte).toContain('lecture seule.')
  })
})

// Les comptes NOMMÉS au palier du levier (#121) — une clé PayFit par société. Le panneau
// n'offrait que les gestes d'une clé UNIQUE (« Renouveler », « Retirer ») : l'org d'un
// groupe ne pouvait poser qu'une société. Trois choses à tenir : le bloc n'apparaît que
// si le connecteur ET le levier le permettent ; le premier compte reste anonyme et garde
// ses gestes ; dès qu'un compte nommé existe, les gestes « clé unique » s'effacent — la
// ligne anonyme a été migrée par le serveur, « Renouveler » la reposerait sans nom (409).
describe('ConnectorCredentialPanel — comptes nommés au palier org', () => {
  const MULTI = { name: 'payfit', label: 'PayFit', auth: { cardinality: 'multi_account', account_noun: 'société' } }
  const MONO = { name: 'pennylane', label: 'Pennylane', auth: { cardinality: 'single' } }
  const ORG = { ...LEVIER, canEdit: () => true, remove: vi.fn(), accountScope: 'org', addAccount: vi.fn() }
  const compte = (id: string, is_default = false) => ({ id, label: id, status: 'ok', is_default, channel: null })

  beforeEach(() => {
    api.getConnectorIdentities.mockReset()
    useMe().me.value = { sub: 'u', role: 'member', org_role: 'org_admin', active_org: 42 } as unknown as Me
  })

  async function monterAvec(lever: Record<string, unknown>, meta: unknown) {
    const host = document.createElement('div')
    const app = createApp({ render: () => h(ConnectorCredentialPanel as never, { lever, row: {}, meta }) })
    app.mount(host)
    for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
    const boutons = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
    app.unmount()
    return boutons
  }

  it('connecteur mono-compte : aucun bloc, la liste n’est même pas lue', async () => {
    const boutons = await monterAvec(ORG, MONO)
    expect(api.getConnectorIdentities).not.toHaveBeenCalled()
    expect(boutons).toEqual(['Renouveler', 'Retirer', 'tester'])
  })

  it('levier sans geste d’ajout (autre palier) : aucun bloc', async () => {
    const { addAccount: _a, accountScope: _s, ...sans } = ORG
    await monterAvec(sans, MULTI)
    expect(api.getConnectorIdentities).not.toHaveBeenCalled()
  })

  it('une seule clé, anonyme : ses gestes restent, et l’ajout d’une société est offert', async () => {
    api.getConnectorIdentities.mockResolvedValue({ connector: 'payfit', supported: true, identities: [compte('')] })
    const boutons = await monterAvec(ORG, MULTI)
    expect(api.getConnectorIdentities).toHaveBeenCalledWith('payfit', 'org')
    expect(boutons).toEqual(['Renouveler', 'Retirer', 'tester', 'Ajouter une société'])
  })

  it('des sociétés nommées : « Renouveler » et « Retirer » de la clé unique s’effacent', async () => {
    api.getConnectorIdentities.mockResolvedValue({
      connector: 'payfit', supported: true, identities: [compte('Société A', true), compte('Société B')],
    })
    const boutons = await monterAvec(ORG, MULTI)
    expect(boutons).not.toContain('Renouveler')
    // « tester » aussi : la sonde d'org ne vise que la ligne anonyme, qui n'existe plus.
    expect(boutons).not.toContain('tester')
    // Chaque société porte son retrait ; celle qui n'est pas par défaut, son « Par défaut ».
    expect(boutons.filter((b) => b === 'Retirer')).toHaveLength(2)
    expect(boutons).toContain('Par défaut')
    expect(boutons).toContain('Ajouter une société')
  })

  it('rien de posé : pas de bloc — le premier compte se pose comme avant, sans nom', async () => {
    await monterAvec({ ...ORG, state: () => ({ present: false, label: 'aucune clé' }) }, MULTI)
    expect(api.getConnectorIdentities).not.toHaveBeenCalled()
  })
})
