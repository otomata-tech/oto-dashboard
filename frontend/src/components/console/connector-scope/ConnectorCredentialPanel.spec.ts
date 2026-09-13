// « Tester » dans le panneau credential (oto#211).
//
// La sonde se présente comme une lecture, mais c'est un POST sans `op`
// (`/api/me/connectors/{provider}/verify`) : en consultation, `ViewAsMiddleware` la refuse en
// `403 view_as_read_only`. Le levier dit donc s'il l'offre (`canVerify`) ; un levier qui ne le
// déclare pas l'offre comme avant (fiche personnelle, plateforme).
import { describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import ConnectorCredentialPanel from './ConnectorCredentialPanel.vue'

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
