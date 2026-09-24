// « Ce qu'il peut faire » liste ce que l'agent VOIT, pas le catalogue (oto#166).
//
// Le monde : six outils au catalogue, dont cinq non masqués par la personne. L'ancienne
// liste en annonçait donc cinq « visibles », y compris ceux d'un connecteur coupé
// (`hunter_find`) et d'un connecteur jamais installé (`apollo_search`). La poignée de
// main n'en montre que trois. Un outil masqué par la personne elle-même (`serper_lens`)
// reste listé, marqué comme tel — le geste pour le rendre a quitté le dashboard (oto#192).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AgentToolbox } from '@/types/api'
import { i18n } from '@/lib/i18n'

const api = vi.hoisted(() => ({
  getAgentContext: vi.fn(), getAgentToolbox: vi.fn(), getInitGuide: vi.fn(), setInitGuide: vi.fn(),
  getTools: vi.fn(), getMyOrgs: vi.fn(),
  setActiveOrg: vi.fn(), clearActiveOrg: vi.fn(),
}))
vi.mock('@/api/console', () => api)

const me = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me, reload: async () => {} }) }))

// Les couches, guides et fiche chargent leurs propres données : hors sujet ici.
const bouchon = vi.hoisted(() => async () => {
  const { defineComponent: dc, h: hh } = await import('vue')
  return { __esModule: true, default: dc({ render: () => hh('div') }) }
})
vi.mock('@/components/console/ContextLayerStack.vue', bouchon)
vi.mock('@/components/console/AgentReadmeCard.vue', bouchon)
vi.mock('@/components/console/GuidesCard.vue', bouchon)
vi.mock('@/components/console/ContextProfileCard.vue', bouchon)
vi.mock('@/components/console/OtoSelect.vue', bouchon)

const PREFS = [
  { name: 'oto_whoami', enabled: true, protected: true },
  { name: 'serper_search', enabled: true },
  { name: 'serper_scrape', enabled: true },
  { name: 'serper_lens', enabled: false },
  { name: 'hunter_find', enabled: true },
  { name: 'apollo_search', enabled: true },
]
const VUE: AgentToolbox = {
  org_id: 42, available: true,
  tools: ['oto_whoami', 'serper_scrape', 'serper_search'],
  tools_total: 500, spine_tools: 1,
  connectors: [{ name: 'serper', label: 'Serper', tools: 2, origin: 'membre' }],
  installed_not_seen: [{ name: 'hunter', label: 'Hunter', state: 'active', origin: 'kit', reason: 'cut' }],
}

const Vide = defineComponent({ render: () => h('div') })

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

async function monter() {
  const View = (await import('./ContextView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/context', '/connectors'].map((path) => ({ path, component: Vide })),
  })
  await router.push('/context')
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.use(router).use(i18n)
  app.mount(host)
  await settle()
  return { host, unmount: () => { app.unmount(); host.remove() } }
}

const texte = (el: Element | null | undefined) => el?.textContent?.trim() ?? ''
const prefixes = (host: HTMLElement) => [...host.querySelectorAll('.ns-name')].map(texte)
const tags = (host: HTMLElement) => [...host.querySelectorAll('.tag')].map(texte)
const bloc = (host: HTMLElement, ns: string) =>
  [...host.querySelectorAll('.ns-block')].find((b) => texte(b.querySelector('.ns-name')) === `${ns}_*`)
const ligne = (host: HTMLElement, outil: string) =>
  [...host.querySelectorAll('.tool-row')].find((r) => texte(r.querySelector('.tool-name')) === outil)

beforeEach(() => {
  vi.clearAllMocks()
  me.value = { sub: 'u-1', home_org: 42, home_org_name: 'Acme' }
  api.getAgentContext.mockResolvedValue({
    org_id: 42, instructions: '', layers: [], tools: { available: true },
    doctrine: { group_id: null, group: null, group_doctrine: '', doctrines: [], referenced_tools: [] },
  })
  api.getMyOrgs.mockResolvedValue({ orgs: [{ id: 42, name: 'Acme' }] })
  api.getTools.mockResolvedValue({ tools: PREFS.map((p) => ({ ...p })) })
  api.getAgentToolbox.mockResolvedValue(VUE)
})

describe('contexte — « ce qu\'il peut faire » liste ce que voit l\'agent', () => {
  it('ne liste pas les outils d\'un connecteur coupé ou jamais installé, et compte ce que l\'agent voit', async () => {
    const { host, unmount } = await monter()
    expect(prefixes(host)).toEqual(['oto_*', 'serper_*'])
    expect(tags(host)).toContain('3 visibles · 1 masqués par toi')
    unmount()
  })

  it('un outil masqué par la personne reste listé et le dit, sans geste pour le masquer ou le rendre', async () => {
    const { host, unmount } = await monter()
    expect(texte(bloc(host, 'serper')?.querySelector('.tag'))).toBe('2 / 3')
    ;(bloc(host, 'serper')!.querySelector('.ns-head') as HTMLElement).click()
    await settle()
    expect(texte(ligne(host, 'serper_lens')?.querySelector('.tag'))).toBe('masqué par toi')
    expect(ligne(host, 'serper_search')?.querySelector('.tag')).toBeNull()
    expect(host.textContent).not.toMatch(/Masquer|Afficher|Tout masquer|Tout activer/)
    unmount()
  })

  it('available:false — ni liste ni compteur, une phrase qui dit que la vue manque', async () => {
    api.getAgentToolbox.mockResolvedValue({ org_id: 42, available: false } satisfies AgentToolbox)
    const { host, unmount } = await monter()
    expect(host.querySelectorAll('.ns-block')).toHaveLength(0)
    expect(tags(host).some((t) => t.includes('visibles'))).toBe(false)
    expect(host.textContent).toContain("n'a pas pu être calculée")
    unmount()
  })

})
