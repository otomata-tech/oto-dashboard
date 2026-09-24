// Les gestes des écrans d'administration d'org, en consultation (oto#211).
//
// Côté serveur (oto-backend `origin/main`, `ViewAsMiddleware`) : quand un opérateur plateforme
// ouvre une org où il n'a aucun rôle réel, toute requête non-GET dont l'`op` n'est pas une
// lecture prend `403 view_as_read_only` — super_admin compris. `/api/me` le dit par
// `active_org_readonly`. Chaque geste ci-dessous a été rejoué contre le middleware avec la
// méthode, le chemin et le corps que le front envoie : refusé en consultation, accepté pour
// un membre réel. Les lectures (GET) passent : l'écran reste lisible, seuls les gestes partent.
//
// GroupsView et BillingView ont leur propre spec ; les leviers de /org/connectors sont dans
// `useOrgAdapter.spec.ts`. Ici, les quatre écrans qui n'en avaient pas.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { i18n } from '@/lib/i18n'

const api = vi.hoisted(() => ({
  getOrg: vi.fn(), setOrgMemberRole: vi.fn(), removeOrgMember: vi.fn(),
  listInvitations: vi.fn(), inviteMember: vi.fn(), revokeInvitation: vi.fn(),
  listPlatformInvitations: vi.fn(), invitePlatformUser: vi.fn(), revokePlatformInvitation: vi.fn(),
  getOrgMfa: vi.fn(), setOrgMfa: vi.fn(),
  updateOrg: vi.fn(), uploadOrgLogo: vi.fn(), deleteOrgLogo: vi.fn(), archiveOrg: vi.fn(), leaveOrg: vi.fn(),
  getOrgEmailSettings: vi.fn(), listScheduledEmails: vi.fn(), cancelScheduledEmail: vi.fn(),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
const me = ref<Record<string, unknown> | null>(null)
// Les helpers de rôle et d'écriture sont les VRAIS : seul le profil est un bouchon.
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me, reload: vi.fn() }),
}))
vi.mock('@/components/console/FormDialog.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ render: () => h('div') }) }
})
// La coquille des connecteurs a ses propres tests (`useOrgAdapter.spec.ts`) : ici, le pied
// « envois programmés » de /org/connectors.
vi.mock('@/components/console/connector-scope/ConnectorScopeView.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ render: () => h('div') }) }
})

type Charger = () => Promise<{ default: object }>

// [écran, vue, gestes d'écriture, ce qui doit rester lu en consultation]
const ECRANS: [string, Charger, string[], string[]][] = [
  ['/org — membres et invitations', () => import('./OrgView.vue'),
    ['promote', 'remove', 'Invite', 'revoke'], ['Bob', 'alice@acme.test']],
  ['/org/settings — profil, logo, zone danger', () => import('./OrgSettingsView.vue'),
    ['modifier', 'changer le logo', 'retirer', 'quitter', 'supprimer'], ['ACME', 'accès débloqués']],
  ['/org/security — MFA obligatoire', () => import('./OrgSecurityView.vue'),
    ['Activer'], ['non imposé']],
  ['/org/connectors — envois programmés', () => import('./OrgConnectorsView.vue'),
    ['Annuler'], ['Relance']],
]

const PORTEURS: [string, Record<string, unknown>][] = [
  ['org_admin', { sub: 'u-test', role: 'member', org_role: 'org_admin', active_org: 42, active_org_name: 'ACME' }],
  ['super_admin', { sub: 'u-test', role: 'super_admin', org_role: null, active_org: 42, active_org_name: 'ACME' }],
]

async function settle() {
  for (let i = 0; i < 8; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 15))
  for (let i = 0; i < 8; i++) await nextTick()
}

async function monter(charger: Charger, porteur: Record<string, unknown>) {
  me.value = porteur
  const View = (await charger()).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.use(i18n).mount(host)
  await settle()
  // Un geste est un bouton, ou une zone cliquable (le dépôt de logo).
  const cliquables = [...host.querySelectorAll('button, [role="button"]')].map((b) => b.textContent?.trim() ?? '')
  const texte = host.textContent ?? ''
  app.unmount()
  host.remove()
  return { cliquables, texte }
}

const presents = (cliquables: string[], gestes: string[]) =>
  gestes.filter((g) => cliquables.some((c) => c.includes(g)))

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  api.getOrg.mockResolvedValue({
    org: { id: 42, name: 'ACME', personal: false, logo_custom: true, logo_url: 'https://logo.invalid/a.png',
      description: 'la maison', my_role: null },
    members: [{ sub: 'u-bob', name: 'Bob', email: 'bob@acme.test', role: 'org_member', active: true }],
    entitlements: [{ namespace: 'fr_', granted_at: '2026-09-01T00:00:00' }],
  })
  api.listInvitations.mockResolvedValue({ invitations: [
    { id: 5, email: 'alice@acme.test', org_role: 'org_member', created_at: '2026-09-01', expires_at: '2026-09-20' },
  ] })
  api.getOrgMfa.mockResolvedValue({ org_id: 42, require_mfa: false, provisioned: true })
  api.getOrgEmailSettings.mockResolvedValue({ settings: { resend: { senders: [{ email: 'x@acme.test' }] } } })
  api.listScheduledEmails.mockResolvedValue({ scheduled_emails: [
    { id: 9, subject: 'Relance', to_email: 'c@acme.test', scheduled_at: '2026-09-14T08:00:00', status: 'pending' },
  ] })
})

describe.each(ECRANS)('%s', (_ecran, charger, gestes, lectures) => {
  it.each(PORTEURS)('%s : gestes présents hors consultation, absents en consultation, lectures intactes',
    async (_nom, porteur) => {
      const hors = await monter(charger, { ...porteur, active_org_readonly: false })
      expect(presents(hors.cliquables, gestes)).toEqual(gestes)

      const consultation = await monter(charger, { ...porteur, active_org_readonly: true })
      expect(presents(consultation.cliquables, gestes)).toEqual([])
      for (const lu of lectures) expect(consultation.texte).toContain(lu)
    })
})

describe('/org/settings en consultation', () => {
  it('ne laisse pas une « zone danger » vide : sans geste, la carte disparaît', async () => {
    const { texte } = await monter(() => import('./OrgSettingsView.vue'),
      { ...PORTEURS[1]![1], active_org_readonly: true })
    expect(texte).not.toContain('zone danger')
  })

  it("l'admin plateforme qui consulte ne se voit plus offrir « quitter » une org dont il n'est pas membre",
    async () => {
      const { cliquables } = await monter(() => import('./OrgSettingsView.vue'),
        { sub: 'u-test', role: 'admin', org_role: null, active_org: 42, active_org_readonly: true })
      expect(presents(cliquables, ['quitter'])).toEqual([])
    })
})
