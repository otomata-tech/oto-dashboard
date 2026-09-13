// Les gestes de /connectors (« mes connecteurs » et marketplace), en consultation (oto#212).
//
// Côté serveur (oto-backend `origin/main` f4124f22, `ViewAsMiddleware`) : quand un opérateur
// plateforme ouvre une org où il n'a aucun rôle réel (`/o/<org>/connectors`), toute requête
// non-GET dont l'`op` n'est pas une lecture prend `403 view_as_read_only` — super_admin compris.
// `/api/me` le dit par `active_org_readonly`. Les 22 écritures ci-dessous (méthode, chemin et
// corps du front) ont été rejouées contre le middleware : refusées en consultation, acceptées
// pour un membre réel ; les lectures passent. L'écran omet donc ses gestes, garde ses lectures,
// et la coque dit la lecture seule une fois (`ConsultOrgBanner`).
//
// Chaque cas monte le composant qui PORTE le geste, avec les VRAIS helpers de `useMe` : seul le
// profil est un bouchon, comme dans `views/console/orgConsultation.spec.ts` (oto#211).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({
  getMyConnectors: vi.fn(), getTools: vi.fn(), getToolRegistry: vi.fn(), getAgentToolbox: vi.fn(),
  getOrgFieldFilters: vi.fn(), getOrgConnectorActivation: vi.fn(), getConnectorInstances: vi.fn(),
  getOrg: vi.fn(), getConnectorIdentities: vi.fn(), getGoogleStatus: vi.fn(), getFederatedStatus: vi.fn(),
  getUnipileStatus: vi.fn(), getAccountGrants: vi.fn(), credentialPrefill: vi.fn(),
  selectConnector: vi.fn(), pauseConnector: vi.fn(), unselectConnector: vi.fn(), setCredential: vi.fn(),
  deleteApiKey: vi.fn(), verifyConnector: vi.fn(), setOrgSecret: vi.fn(), suspendInstance: vi.fn(),
  startConnectorFlow: vi.fn(), revokeGoogle: vi.fn(), disconnectFederated: vi.fn(),
  setConnectorIdentity: vi.fn(), connectUnipile: vi.fn(), disconnectUnipile: vi.fn(),
  grantAccountAccess: vi.fn(), revokeAccountAccess: vi.fn(),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
const me = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me, reload: vi.fn(async () => null), load: vi.fn(async () => null) }),
}))
const vide = vi.hoisted(() => async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ render: () => h('div') }) }
})
vi.mock('@/components/console/FormDialog.vue', vide)
vi.mock('@/components/console/ConnectorSessionConnect.vue', vide)

import { useUserAdapter } from './useUserAdapter'

const ctx = { openForm: vi.fn(), openCredential: vi.fn(), confirmAction: vi.fn(async () => true), toast: vi.fn() }
const lever = () => useUserAdapter(ctx)

const PENNYLANE = {
  name: 'pennylane', label: 'Pennylane', state: 'active', namespaces: ['pennylane'], category: 'finance',
  auth_modes: ['byo_user', 'byo_org'], verifiable: true, description: 'la compta',
  credential_fields: [{ name: 'api_key', label: 'Clé API', secret: true, required: true }],
  auth: { method: 'secret', cardinality: 'single', fields: [] },
}
const HTTP = { ...PENNYLANE, name: 'http', label: 'HTTP', auth_modes: ['byo_org'], verifiable: false }
const SLACK = { ...PENNYLANE, name: 'slack', label: 'Slack',
  auth: { method: 'secret', cardinality: 'multi_account', account_noun: 'workspace', fields: [] } }
const ZOHO = { ...PENNYLANE, name: 'zoho', label: 'Zoho',
  connect: { label: 'Autoriser Zoho', params: [], app_ready: true, callback_url: null } }
const ATLASSIAN = { ...PENNYLANE, name: 'atlassian', label: 'Atlassian',
  auth: { method: 'oauth', cardinality: 'single', fields: [] } }
const BREVO = { ...PENNYLANE, name: 'brevo', label: 'Brevo', identities: true,
  auth: { method: 'cookie', cardinality: 'single', fields: [] } }
const INSTANCE = (level: string, ref: string) =>
  ({ ref, connector: 'pennylane', level, owner: { type: level, id: 1, label: 'ACME' }, name: 'Pennylane', via: 'credential' })

type Cas = {
  charger: () => Promise<{ default: object }>
  props?: () => Record<string, unknown>
  avant?: () => void
  providers?: Record<string, unknown>
  gestes: string[]
  lectures: string[]
}

const CAS: [string, Cas][] = [
  ['disponibilité — exposition', {
    charger: () => import('./ConnectorAvailabilityPanel.vue'),
    props: () => ({ lever: lever().availability, row: { ...PENNYLANE } }),
    gestes: ['Non installé', 'En veille', 'Actif'], lectures: ['Actif'] }],
  ['connexion — poser sa clé', {
    charger: () => import('./ConnectorConnectionPanel.vue'),
    props: () => ({ connector: PENNYLANE, lever: lever().connection }),
    gestes: ['Connecter Pennylane'], lectures: ['état pour toi', 'Aucune clé'] }],
  ["connexion — poser la clé d'org", {
    charger: () => import('./ConnectorConnectionPanel.vue'),
    props: () => ({ connector: HTTP, lever: lever().connection }),
    gestes: ["Poser la clé de l'org"], lectures: ['état pour toi'] }],
  ['connexion — flux déclaré', {
    charger: () => import('./ConnectorConnectionPanel.vue'),
    props: () => ({ connector: ZOHO, lever: lever().connection }),
    gestes: ['Autoriser Zoho', "identifiants de l'application"], lectures: ['état pour toi'] }],
  ['pile de provenance — la clé posée', {
    charger: () => import('./ConnectorKeyStack.vue'),
    props: () => ({ connector: PENNYLANE, lever: lever().connection }),
    avant: () => api.getConnectorInstances.mockResolvedValue({ instances: [INSTANCE('member', 'm'), INSTANCE('org', 'o')] }),
    providers: { pennylane: { mode: 'member', user_key_configured: true } },
    gestes: ['Tester', 'Remplacer', 'Retirer', 'Suspendre'], lectures: ['Ta clé', 'utilisée'] }],
  ['comptes nommés', {
    charger: () => import('../ConnectorKeyAccounts.vue'),
    props: () => ({ connector: SLACK, lever: lever().connection }),
    avant: () => api.getConnectorIdentities.mockResolvedValue({ connector: 'slack', supported: true, identities: [
      { id: 'principal', label: 'principal', is_default: true, status: 'ok', channel: null },
      { id: 'client-x', label: 'client-x', is_default: false, status: 'ok', channel: null }] }),
    gestes: ['Par défaut', 'Retirer', 'Ajouter un workspace'], lectures: ['client-x'] }],
  ['Google — comptes OAuth', {
    charger: () => import('../ConnectorOAuthAccounts.vue'),
    avant: () => api.getGoogleStatus.mockResolvedValue({ accounts: [
      { email: 'a@acme.test', is_default: true, scopes: ['gmail'], granted_at: '2026-09-01' }] }),
    gestes: ['Revoke', 'Link account'], lectures: ['a@acme.test'] }],
  ['MCP fédéré — connecté', {
    charger: () => import('../ConnectorFederatedWidget.vue'),
    props: () => ({ connector: ATLASSIAN }),
    avant: () => api.getFederatedStatus.mockResolvedValue({ connected: true, set_at: '2026-09-01' }),
    gestes: ['Disconnect'], lectures: ['login délégué'] }],
  ['MCP fédéré — à connecter', {
    charger: () => import('../ConnectorFederatedWidget.vue'),
    props: () => ({ connector: ATLASSIAN }),
    avant: () => api.getFederatedStatus.mockResolvedValue({ connected: false }),
    gestes: ['Connect'], lectures: ['not connected'] }],
  ['session navigateur', {
    charger: () => import('../ConnectorSessionWidget.vue'),
    props: () => ({ connector: BREVO }),
    providers: { brevo: { user_key_configured: true, session_set_at: '2026-09-01', identity_label: 'Client A' } },
    gestes: ['Déconnecter', 'Connecter', 'Changer'], lectures: ['session · toi', 'cible : Client A'] }],
  ['compte hébergé et son partage', {
    charger: () => import('../ConnectorHostedWidget.vue'),
    avant: () => {
      api.getUnipileStatus.mockResolvedValue({ subscribed: true, mode: 'user', elsewhere: {},
        channels: { linkedin: { connected: true, connected_at: '2026-09-01' } } })
      api.getConnectorIdentities.mockResolvedValue({ identities: [
        { id: 'acc2', label: 'LinkedIn B', channel: 'linkedin', is_default: false, status: 'OK' }] })
      api.getAccountGrants.mockResolvedValue({ granted_to_me: [], granted_by_me: [
        { provider: 'linkedin', grantee_sub: 'u-bob', grantee_name: 'Bob', granted_at: '2026-09-01' }] })
    },
    gestes: ['changer ma clé', 'retirer', 'Déconnecter', 'Connecter', 'Utiliser ce compte', "Autoriser quelqu'un", 'Révoquer'],
    lectures: ['ta clé perso', 'LinkedIn B', 'Bob'] }],
  ['marketplace — la grille', {
    charger: () => import('@/views/console/ConnectorLibraryView.vue'),
    avant: () => api.getMyConnectors.mockResolvedValue({ connectors: [{ ...PENNYLANE, state: 'not_selected' }] }),
    gestes: ['Install'], lectures: ['Pennylane'] }],
  ['marketplace — la fiche', {
    charger: () => import('../library/ConnectorDetail.vue'),
    props: () => ({ connector: { ...PENNYLANE, state: 'not_selected' }, tools: [], busy: false }),
    gestes: ['Installer'], lectures: ['Pennylane'] }],
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

async function monter(cas: Cas, porteur: Record<string, unknown>) {
  me.value = { ...porteur, providers: cas.providers ?? {} }
  cas.avant?.()
  const C = (await cas.charger()).default
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] })
  await router.push('/connectors')
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(C, cas.props?.())
  app.use(router)
  app.mount(host)
  await settle()
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
  api.getOrgConnectorActivation.mockResolvedValue({ connectors: [] })
  api.getConnectorInstances.mockResolvedValue({ instances: [] })
  api.getOrg.mockResolvedValue({ members: [] })
  api.getConnectorIdentities.mockResolvedValue({ connector: 'x', supported: true, identities: [] })
  api.getToolRegistry.mockResolvedValue({ tools: [], count: 0 })
  api.getAccountGrants.mockResolvedValue({ granted_by_me: [], granted_to_me: [] })
})

describe.each(CAS)('/connectors — %s', (_nom, cas) => {
  it.each(PORTEURS)('%s : gestes présents hors consultation, absents en consultation, lectures intactes',
    async (_porteur, porteur) => {
      const hors = await monter(cas, { ...porteur, active_org_readonly: false })
      expect(presents(hors.cliquables, cas.gestes)).toEqual(cas.gestes)

      const consultation = await monter(cas, { ...porteur, active_org_readonly: true })
      expect(presents(consultation.cliquables, cas.gestes)).toEqual([])
      for (const lu of cas.lectures) expect(consultation.texte).toContain(lu)
    })

  it("l'admin plateforme qui consulte l'org n'y trouve aucun geste", async () => {
    const { cliquables } = await monter(cas,
      { sub: 'u-test', role: 'admin', org_role: null, active_org: 42, active_org_readonly: true })
    expect(presents(cliquables, cas.gestes)).toEqual([])
  })
})
