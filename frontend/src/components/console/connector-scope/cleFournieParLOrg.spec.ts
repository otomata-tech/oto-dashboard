// Retour du 01/10/2026 : sur un connecteur dont la clé est posée par l'org, l'écran d'un
// MEMBRE laissait croire qu'il devait l'installer « de zéro » et coller sa propre clé.
// Attendu : « Clé fournie par ton organisation : rien à saisir » ; « Activer » seulement
// si le connecteur n'est pas encore dans sa boîte à outils ; sa propre clé en option
// secondaire. Sans clé partagée, rien ne change.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({
  getMyConnectors: vi.fn(), getTools: vi.fn(), getToolRegistry: vi.fn(), getAgentToolbox: vi.fn(),
  getOrgFieldFilters: vi.fn(), getOrgConnectorActivation: vi.fn(), getConnectorInstances: vi.fn(),
  getOrg: vi.fn(), getConnectorIdentities: vi.fn(), credentialPrefill: vi.fn(),
  selectConnector: vi.fn(), pauseConnector: vi.fn(), unselectConnector: vi.fn(), setCredential: vi.fn(),
  deleteApiKey: vi.fn(), verifyConnector: vi.fn(), setOrgSecret: vi.fn(), suspendInstance: vi.fn(),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
const me = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me, reload: vi.fn(async () => null), load: vi.fn(async () => null) }),
}))

import { useUserAdapter } from './useUserAdapter'
import { i18n } from '@/lib/i18n'

const ctx = { openForm: vi.fn(), openCredential: vi.fn(), confirmAction: vi.fn(async () => true), toast: vi.fn() }

const NEXT = {
  name: 'nextmotion', label: 'Nextmotion', state: 'active', namespaces: ['nextmotion'], category: 'santé',
  auth_modes: ['byo_user', 'byo_org'], verifiable: true, description: 'le logiciel de la clinique',
  credential_fields: [{ name: 'api_key', label: 'Clé API', secret: true, required: true }],
  auth: { method: 'secret', cardinality: 'single', fields: [] },
}
const ORG_ONLY = { ...NEXT, name: 'http', label: 'HTTP', auth_modes: ['byo_org'] }
const ORG_KEY = { mode: 'org', user_key_configured: false, org_secret_configured: true,
  platform_key_label: null, quota_used_today: 0, quota_daily: null }
const NO_KEY = { ...ORG_KEY, mode: 'forbidden', org_secret_configured: false }
const MEMBRE = { sub: 'u-m', role: 'member', org_role: 'org_member', active_org: 353,
  active_org_name: 'Clinique', active_org_is_personal: false, active_org_readonly: false }

async function settle() {
  for (let i = 0; i < 8; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 15))
  for (let i = 0; i < 8; i++) await nextTick()
}

async function monter(load: () => Promise<{ default: object }>, props: Record<string, unknown>,
  providers: Record<string, unknown>) {
  me.value = { ...MEMBRE, providers }
  const C = (await load()).default
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] })
  await router.push('/connectors'); await router.isReady()
  const host = document.createElement('div'); document.body.appendChild(host)
  const app = createApp(C, props); app.use(router).use(i18n); app.mount(host)
  await settle()
  const boutons = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
  const texte = host.textContent ?? ''
  app.unmount(); host.remove()
  return { boutons, texte }
}

const panneau = () => import('./ConnectorConnectionPanel.vue')
const fiche = () => import('../library/ConnectorDetail.vue')
const grille = () => import('@/views/console/ConnectorLibraryView.vue')
const FOURNIE = 'Clé fournie par ton organisation : rien à saisir'

beforeEach(() => {
  i18n.global.locale.value = 'fr'
  vi.clearAllMocks()
  api.getOrgConnectorActivation.mockResolvedValue({ connectors: [] })
  api.getConnectorInstances.mockResolvedValue({ instances: [] })
  api.getOrg.mockResolvedValue({ members: [] })
  api.getConnectorIdentities.mockResolvedValue({ connector: 'x', supported: true, identities: [] })
  api.getToolRegistry.mockResolvedValue({ tools: [], count: 0 })
})

describe('clé d’org présente, connecteur actif', () => {
  it('panneau : la clé est dite fournie, aucun « Connecter », sa propre clé en option', async () => {
    const { boutons, texte } = await monter(panneau,
      { connector: NEXT, lever: useUserAdapter(ctx).connection }, { nextmotion: ORG_KEY })
    expect(texte).toContain(FOURNIE)
    expect(texte).not.toContain('une clé API unique, collée une fois')
    expect(boutons.some((b) => b.includes('Connecter'))).toBe(false)
    expect(boutons).toContain('Utiliser ma propre clé')
  })
  it('panneau, connecteur sans clé personnelle : rien à poser du tout', async () => {
    const { boutons, texte } = await monter(panneau,
      { connector: ORG_ONLY, lever: useUserAdapter(ctx).connection }, { http: ORG_KEY })
    expect(texte).toContain(FOURNIE)
    expect(boutons.some((b) => /Connecter|Poser/.test(b))).toBe(false)
  })
  it('fiche : la clé est dite fournie, pas de bouton d’installation', async () => {
    const { boutons, texte } = await monter(fiche,
      { connector: NEXT, tools: [], busy: false }, { nextmotion: ORG_KEY })
    expect(texte).toContain(FOURNIE)
    expect(texte).toContain('pour utiliser ta propre clé (optionnel)')
    expect(boutons.some((b) => /Installer|Activer/.test(b))).toBe(false)
  })
})

describe('clé d’org présente, connecteur pas encore dans sa boîte à outils', () => {
  it('fiche : « Activer », pas « Installer », et la clé dite fournie', async () => {
    const { boutons, texte } = await monter(fiche,
      { connector: { ...NEXT, state: 'not_selected' }, tools: [], busy: false }, { nextmotion: ORG_KEY })
    expect(boutons).toContain('Activer')
    expect(boutons).not.toContain('Installer')
    expect(texte).toContain(FOURNIE)
  })
  it('grille : « Activer », pas « Installer »', async () => {
    api.getMyConnectors.mockResolvedValue({ connectors: [{ ...NEXT, state: 'not_selected' }] })
    const { boutons } = await monter(grille, {}, { nextmotion: ORG_KEY })
    expect(boutons).toContain('Activer')
    expect(boutons).not.toContain('Installer')
  })
})

describe('aucune clé : comportement inchangé', () => {
  it('panneau : « Connecter Nextmotion », pas de clé fournie', async () => {
    const { boutons, texte } = await monter(panneau,
      { connector: NEXT, lever: useUserAdapter(ctx).connection }, { nextmotion: NO_KEY })
    expect(texte).not.toContain(FOURNIE)
    expect(boutons).toContain('Connecter Nextmotion')
  })
  it('fiche : « Installer », les champs sans mention optionnelle', async () => {
    const { boutons, texte } = await monter(fiche,
      { connector: { ...NEXT, state: 'not_selected' }, tools: [], busy: false }, { nextmotion: NO_KEY })
    expect(boutons).toContain('Installer')
    expect(texte).not.toContain(FOURNIE)
    expect(texte).not.toContain('optionnel')
  })
})
