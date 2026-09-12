// L'accueil compte ce que l'agent VOIT, pas ce que le catalogue promet (oto#166).
//
// Le monde de ces tests est construit pour que l'ancien calcul et le nouveau
// divergent : trois connecteurs du catalogue ont une clé qui résout (l'ancien
// compteur disait « 3 connecteurs actifs »), mais la poignée de main n'en montre
// qu'un à l'agent. Et quand la vue n'a pas pu être dérivée, la stat disparaît :
// un zéro y dirait « ton agent n'a rien », ce qu'aucune mesure n'a établi.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/lib/i18n'
import type { AgentToolbox } from '@/types/api'

const api = vi.hoisted(() => ({
  getConnectors: vi.fn(), getDoctrine: vi.fn(), getGoogleStatus: vi.fn(),
  getActivitySummary: vi.fn(), getKbProject: vi.fn(), listDocs: vi.fn(),
  getAgentToolbox: vi.fn(),
}))
vi.mock('@/api/console', () => api)

const me = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me }), isPlatformOperator: () => false }))

// Les cartes voisines chargent leurs propres données : hors sujet ici.
const bouchon = vi.hoisted(() => async () => {
  const { defineComponent: dc, h: hh } = await import('vue')
  // `__esModule` : l'accueil charge le graphe par `defineAsyncComponent(import())`, qui
  // ne prend `default` que sur un module reconnu comme tel.
  return { __esModule: true, default: dc({ render: () => hh('div') }) }
})
vi.mock('@/components/console/InboxCard.vue', bouchon)
vi.mock('@/components/console/ConnectorHealthGrid.vue', bouchon)
vi.mock('@/components/console/McpEndpointCard.vue', bouchon)
vi.mock('@/components/console/ContextPreviewCard.vue', bouchon)
vi.mock('@/components/console/CallsBarChart.vue', bouchon)

const LIBELLE = 'connecteurs que voit ton agent'
const CATALOGUE = ['serper', 'hunter', 'apollo'].map((name) =>
  ({ name, label: name, secret_kind: 'api_key', personal_session: false }))

const Vide = defineComponent({ render: () => h('div') })

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

async function monter() {
  const View = (await import('./OverviewView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/overview', '/connectors', '/projects', '/activity', '/platform/monitoring', '/documents', '/org']
      .map((path) => ({ path, component: Vide })),
  })
  await router.push('/overview')
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.use(router)
  app.use(i18n)
  app.mount(host)
  await settle()
  return { host, unmount: () => { app.unmount(); host.remove() } }
}

const stats = (host: HTMLElement) => [...host.querySelectorAll('.stat')]
const stat = (host: HTMLElement, label: string) =>
  stats(host).find((s) => s.querySelector('.l')?.textContent?.trim() === label)

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  // Trois clés qui résolvent : l'ancien compteur aurait affiché 3.
  me.value = {
    sub: 'u-1', active_org: 42, active_org_name: 'Acme', org_role: 'member',
    providers: {
      serper: { mode: 'platform', user_key_configured: false },
      hunter: { mode: 'platform', user_key_configured: false },
      apollo: { mode: 'org', user_key_configured: false },
    },
  }
  api.getConnectors.mockResolvedValue({ connectors: CATALOGUE })
  api.getGoogleStatus.mockResolvedValue({ connected: false })
  api.getDoctrine.mockResolvedValue({ doctrine: { exists: true } })
  api.getKbProject.mockResolvedValue(null)
  // Une activité réelle : sinon l'accueil rend son état « calme » et aucune stat.
  api.getActivitySummary.mockResolvedValue({ total_calls: 12, error_count: 0, by_day: [], by_tool: [], active_users: 1 })
})

describe('accueil — le compteur de connecteurs dit ce que voit l\'agent', () => {
  it('compte les connecteurs dont l\'agent voit un outil, et les outils visibles — pas les outils montés', async () => {
    api.getAgentToolbox.mockResolvedValue({
      org_id: 42, available: true,
      tools: ['oto_whoami', 'data_rows', 'serper_search', 'serper_scrape', 'serper_maps', 'serper_lens', 'oto_guide'],
      tools_total: 300, spine_tools: 3,
      connectors: [{ name: 'serper', label: 'Serper', tools: 4, origin: 'kit' }],
      installed_not_seen: [{ name: 'hunter', label: 'Hunter', state: 'active', origin: 'membre', reason: 'cut' }],
    } satisfies AgentToolbox)
    const { host, unmount } = await monter()
    const s = stat(host, LIBELLE)
    expect(s, 'la stat doit être rendue').toBeTruthy()
    expect(s!.querySelector('.v')!.textContent!.trim()).toBe('1')
    expect(s!.querySelector('.sub')!.textContent!.trim()).toBe('7 outils visibles pour ton agent')
    expect(s!.textContent).not.toContain('300')
    unmount()
  })

  it('available:false — la stat n\'est pas rendue, plutôt qu\'un zéro', async () => {
    api.getAgentToolbox.mockResolvedValue({ org_id: 42, available: false } satisfies AgentToolbox)
    const { host, unmount } = await monter()
    expect(stat(host, LIBELLE)).toBeUndefined()
    // sessions · appels · org active : rien d'autre ne compte des connecteurs.
    expect(stats(host).map((x) => x.querySelector('.l')?.textContent?.trim()))
      .toEqual(['sessions', 'appels · 7 jours', 'org active'])
    unmount()
  })

  it('un zéro SERVI s\'affiche : la vue a été dérivée et l\'agent ne voit aucun connecteur', async () => {
    api.getAgentToolbox.mockResolvedValue({
      org_id: 42, available: true, tools: ['oto_whoami'], tools_total: 300, spine_tools: 1,
      connectors: [], installed_not_seen: [],
    } satisfies AgentToolbox)
    const { host, unmount } = await monter()
    expect(stat(host, LIBELLE)!.querySelector('.v')!.textContent!.trim()).toBe('0')
    unmount()
  })

  it('chargement en échec — pas de stat, et le bandeau le dit', async () => {
    api.getAgentToolbox.mockRejectedValue(new Error('500 internal'))
    const { host, unmount } = await monter()
    expect(stat(host, LIBELLE)).toBeUndefined()
    expect(stats(host)).toHaveLength(3)
    expect(host.querySelector('p.helptext')?.textContent?.trim()).toBeTruthy()
    unmount()
  })
})
