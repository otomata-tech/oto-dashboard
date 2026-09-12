// L'îlot « Dernières modifications » (oto#191) n'énonce que ce que la route rend : une liste
// servie avec ses liens, une liste vide comme vide, un échec comme un échec, et un auteur
// `null` sans aucun nom à sa place.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/lib/i18n'
import type { RecentChangesView } from '@/types/api'
import { relativeSince } from '@/lib/recentChanges'

const api = vi.hoisted(() => ({ getRecentChanges: vi.fn() }))
vi.mock('@/api/console', () => api)

// Le contrat servi en préprod (oto-backend f1d03c80), exemple de l'issue mot pour mot.
const SERVI: RecentChangesView = {
  items: [
    { type: 'doc', id: 812, title: 'Beta', project: { id: 57, name: 'Projet A1' }, slug: null, scope: null,
      author: { sub: 'usr_x', name: 'Julie' }, updated_at: '2026-09-12 22:01:50' },
    { type: 'procedure', id: 344, title: 'Procédure A', project: null, slug: 'proc-a', scope: 'org',
      author: null, updated_at: '2026-09-12 21:58:03' },
  ],
  limit: 20,
}
// Cinq minutes après la première modification, en UTC.
const MAINTENANT = Date.UTC(2026, 8, 12, 22, 6, 50)

const Vide = defineComponent({ render: () => h('div') })

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

async function monter() {
  const Card = (await import('./RecentChangesCard.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:chemin(.*)*', component: Vide }],
  })
  await router.push('/overview')
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(Card)
  app.use(router)
  app.use(i18n)
  app.mount(host)
  await settle()
  return { host, unmount: () => { app.unmount(); host.remove() } }
}

const lignes = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.rc-row')]
const texte = (el: Element | null | undefined) => el?.textContent?.trim()

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  // Seule l'horloge est figée : les minuteurs restent réels, `settle` en dépend.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(MAINTENANT)
})
afterEach(() => { vi.useRealTimers() })

describe('accueil — « Dernières modifications »', () => {
  it('une liste servie : titre, type, projet ou portée, auteur, date, et le lien qui ouvre', async () => {
    api.getRecentChanges.mockResolvedValue(SERVI)
    const { host, unmount } = await monter()
    expect(api.getRecentChanges).toHaveBeenCalledWith(10)
    expect(host.textContent).toContain('Dernières modifications')
    expect(lignes(host)).toHaveLength(2)
    const [page, proc] = lignes(host)

    expect(page!.tagName).toBe('A')
    expect(page!.getAttribute('href')).toBe('/projects/57?doc=812')
    expect(texte(page!.querySelector('.rc-title'))).toBe('Beta')
    expect(texte(page!.querySelector('.tag'))).toBe('page')
    expect(texte(page!.querySelector('.rc-where'))).toBe('Projet A1')
    expect(texte(page!.querySelector('.rc-author'))).toBe('Julie')
    expect(texte(page!.querySelector('.rc-when'))).toBe('il y a 5 minutes')

    expect(proc!.getAttribute('href')).toBe('/procedures/344')
    expect(texte(proc!.querySelector('.tag'))).toBe('procédure')
    expect(texte(proc!.querySelector('.rc-where'))).toBe('org')
    expect(texte(proc!.querySelector('.rc-when'))).toBe('il y a 8 minutes')
    unmount()
  })

  it('auteur null : aucun nom à sa place — ni identifiant, ni « null », ni « inconnu »', async () => {
    api.getRecentChanges.mockResolvedValue(SERVI)
    const { host, unmount } = await monter()
    const proc = lignes(host)[1]!
    expect(proc.querySelector('.rc-author')).toBeNull()
    expect(proc.textContent).not.toMatch(/null|undefined|usr_|inconnu/i)
    // portée + date, rien entre les deux
    expect([...proc.querySelector('.rc-meta')!.children].map((e) => e.className)).toEqual(['rc-where', 'rc-when'])
    unmount()
  })

  it('liste vide : l\'état vide le dit, sans chargement qui dure ni erreur', async () => {
    api.getRecentChanges.mockResolvedValue({ items: [], limit: 10 } satisfies RecentChangesView)
    const { host, unmount } = await monter()
    expect(lignes(host)).toHaveLength(0)
    expect(host.textContent).toContain('aucune page ni procédure modifiée')
    expect(host.textContent).not.toContain('chargement')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    unmount()
  })

  it('échec : affiché comme une erreur, pas comme une liste vide', async () => {
    api.getRecentChanges.mockRejectedValue(new Error('500 internal'))
    const { host, unmount } = await monter()
    const alerte = host.querySelector('[role="alert"]')
    expect(alerte?.textContent).toContain("les dernières modifications n'ont pas pu être chargées")
    expect(alerte?.textContent).toContain('500 internal')
    expect(host.textContent).not.toContain('aucune page ni procédure modifiée')
    expect(lignes(host)).toHaveLength(0)
    unmount()
  })
})

describe('relativeSince — l\'horodatage sans fuseau se lit en UTC', () => {
  it('« 2026-09-12 22:01:50 » vaut 22:01:50 UTC même sur un poste à Paris', () => {
    const avant = process.env.TZ
    process.env.TZ = 'Europe/Paris'
    try {
      // Contre-épreuve : lue comme une heure locale, la même chaîne tomberait deux heures plus tôt.
      expect(Date.parse('2026-09-12T22:01:50')).not.toBe(Date.UTC(2026, 8, 12, 22, 1, 50))
      expect(relativeSince('2026-09-12 22:01:50', Date.UTC(2026, 8, 12, 22, 1, 50), 'fr')).toBe('maintenant')
      expect(relativeSince('2026-09-12 22:01:50', Date.UTC(2026, 8, 12, 23, 1, 50), 'en')).toBe('1 hour ago')
    } finally {
      if (avant === undefined) delete process.env.TZ
      else process.env.TZ = avant
    }
  })

  it('une date illisible ne rend pas de date', () => {
    expect(relativeSince('pas une date', MAINTENANT, 'fr')).toBeNull()
  })
})
