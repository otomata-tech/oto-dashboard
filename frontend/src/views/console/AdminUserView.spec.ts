// Fiche utilisateur de la plateforme (oto#233, ADR 0044 §H, barreau B3). Prêter la clé
// Otomata et offrir l'option payante se font sur la carte du connecteur, onglet « accès
// plateforme » : la fiche n'en garde que le STATUT EFFECTIF, en lecture seule, et un
// renvoi vers /platform/connectors. Ce spec fixe ce qu'aucun type ne protège :
//   1. aucun levier d'écriture sur l'accès plateforme — ni bouton dans les cartes
//      d'accès, ni libellé des leviers retirés, ni requête vers leurs routes, même après
//      avoir cliqué et confirmé TOUS les gestes restants de la fiche ;
//   2. le statut effectif est rendu, et le renvoi est un vrai lien, qui navigue.
// C'est `api()` qui est simulée, pas les fonctions de `api/console` : l'assertion porte
// sur les routes appelées, pas sur des noms d'export qu'un retour du levier changerait.
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { usePrompt } from '@/composables/usePrompt'

const sent: { path: string; method: string }[] = []

// Chaque ligne est posée là où l'ancien écran armait un levier : un prêt de clé en cours
// (« Révoquer »), un provider servi par la clé plateforme (« Prêter la clé »), l'option
// offerte à l'utilisateur (« Retirer » / « Accorder l'option »).
const DETAIL = {
  sub: 'user_carla', email: 'carla@example.com', name: 'Carla', role: 'member', active_org: 1,
  orgs: [{ org_id: 1, name: 'Acme', org_role: 'org_member', is_active: true, joined_at: '2026-08-01 10:00:00' }],
  providers: {
    unipile: {
      mode: 'platform', user_key_configured: false, org_secret_configured: false,
      platform_key_label: 'default', quota_used_today: 3, quota_daily: 50,
    },
    apollo: {
      mode: 'forbidden', user_key_configured: false, org_secret_configured: false,
      platform_key_label: null, quota_used_today: 0, quota_daily: null,
    },
  },
  grants: [{ provider: 'unipile', label: 'default', daily_quota: 50 }],
  option_comps: ['unipile'],
  unipile_orgs: [],
}

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  api: vi.fn(async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    sent.push({ path, method })
    if (method !== 'GET') return { ok: true, removed: [] }
    if (path === '/api/admin/users/user_carla') return DETAIL
    if (path.startsWith('/api/admin/monitoring/calls')) return { calls: [] }
    throw new Error(`lecture inattendue : ${path}`)
  }),
}))

// super_admin : le cas où la fiche offre le plus de gestes.
const me = ref({ sub: 'user_admin', role: 'super_admin' })
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me }),
}))

const Vide = defineComponent({ render: () => h('div') })

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

async function mountView() {
  const View = (await import('./AdminUserView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/platform/users', component: Vide },
      { path: '/platform/users/:sub', component: Vide },
      { path: '/platform/connectors', component: Vide },
    ],
  })
  await router.push('/platform/users/user_carla')
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.use(router)
  app.mount(host)
  await settle()
  return { host, router, unmount: () => { app.unmount(); host.remove() } }
}

// Une carte par son titre (`ConsoleCard` rend son titre en `.card-head .t`).
function card(host: HTMLElement, title: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>('section.card')]
    .filter((s) => s.querySelector('.card-head .t')?.textContent?.trim() === title)
  expect(found, `carte « ${title} »`).toHaveLength(1)
  return found[0]!
}

const ACCESS_CARDS = ['accès connecteurs', 'options de connecteur']
const REMOVED_LABELS = ['Prêter la clé', 'Révoquer', "Accorder l'option", 'Retirer']
const PLATFORM_ACCESS_ROUTES = /\/grants\/|\/option-comps|\/platform-access|\/platform-keys/

describe('AdminUserView — accès plateforme en lecture seule (oto#233)', () => {
  it("ne rend aucun levier d'écriture sur l'accès plateforme, même après tous les gestes de la fiche", async () => {
    sent.length = 0
    const { host, unmount } = await mountView()
    expect(host.textContent).toContain('carla@example.com') // la fiche est bien rendue

    for (const title of ACCESS_CARDS) expect(card(host, title).querySelectorAll('button')).toHaveLength(0)
    for (const label of REMOVED_LABELS) expect(host.textContent).not.toContain(label)

    // Tous les gestes restants (rôles, 2FA, rôle d'org), cliqués ET confirmés : aucun
    // n'atteint une route d'accès plateforme. « Voir en tant que » recharge la page.
    const { state, resolve } = usePrompt()
    const clicked = new Set<Element>()
    for (let pass = 0; pass < 3; pass++) {
      const buttons = [...host.querySelectorAll('button')]
        .filter((b) => !clicked.has(b) && !b.disabled && !b.textContent?.includes('Voir en tant que'))
      for (const b of buttons) {
        clicked.add(b)
        b.click()
        await settle()
        if (state.value) { resolve(true); await settle() }
      }
    }

    expect(sent.filter((s) => PLATFORM_ACCESS_ROUTES.test(s.path))).toEqual([])
    // Témoin : les gestes confirmés ont bien écrit — sans lui, la ligne du dessus
    // passerait aussi si aucun clic n'avait rien déclenché.
    expect(sent.some((s) => s.method !== 'GET')).toBe(true)
    unmount()
  })

  it('rend le statut effectif et un vrai lien vers /platform/connectors', async () => {
    const { host, router, unmount } = await mountView()
    const keys = card(host, 'accès connecteurs')
    const options = card(host, 'options de connecteur')

    expect(keys.textContent).toContain('plateforme · 3/50')
    expect(keys.textContent).toContain('aucun accès')
    expect(options.textContent).toContain('offerte (comp user)')

    for (const c of [keys, options]) {
      expect(c.querySelectorAll('.card-head .s a[href="/platform/connectors"]')).toHaveLength(1)
    }
    keys.querySelector<HTMLAnchorElement>('.card-head .s a[href="/platform/connectors"]')!.click()
    await settle()
    expect(router.currentRoute.value.path).toBe('/platform/connectors')
    unmount()
  })
})
