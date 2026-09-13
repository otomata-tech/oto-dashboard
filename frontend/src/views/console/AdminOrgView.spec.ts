// Fiche d'org de la plateforme (oto#233, ADR 0044 §H) : l'accès plateforme aux
// connecteurs y est en lecture seule, et son renvoi vers la carte du connecteur était
// une mention en texte brut. Ce spec fixe que c'est un VRAI lien, qui navigue. Le
// sous-titre d'une carte ne rend pas de HTML : le lien passe par le slot `sub`.
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const ORG = {
  org: {
    id: 7, name: 'Acme', personal: false, logo_url: null, logo_custom: false,
    domain: null, industry: null, location: null, description: null,
  },
  members: [], secrets: [], option_comps: ['unipile'],
  billing: { subscribed: false, plans: [], granted: [] },
}

vi.mock('@/api/console', () => ({
  getAdminOrg: vi.fn(async () => ORG),
  getPlans: vi.fn(async () => ({ plans: [] })),
}))

// Membre simple : la carte d'accès plateforme ne dépend d'aucun rôle.
const me = ref({ sub: 'user_member', role: 'member' })
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
  const View = (await import('./AdminOrgView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/platform/orgs', component: Vide },
      { path: '/platform/orgs/:id', component: Vide },
      { path: '/platform/connectors', component: Vide },
    ],
  })
  await router.push('/platform/orgs/7')
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.use(router)
  app.mount(host)
  await settle()
  return { host, router, unmount: () => { app.unmount(); host.remove() } }
}

describe('AdminOrgView — renvoi vers la carte du connecteur (oto#233)', () => {
  it('renvoie à /platform/connectors par un vrai lien, qui navigue', async () => {
    const { host, router, unmount } = await mountView()
    const cards = [...host.querySelectorAll<HTMLElement>('section.card')]
      .filter((s) => s.querySelector('.card-head .t')?.textContent?.trim() === 'accès plateforme aux connecteurs')
    expect(cards).toHaveLength(1)
    const c = cards[0]!

    expect(c.textContent).toContain('unipile')            // le statut, en lecture seule
    expect(c.querySelectorAll('button')).toHaveLength(0)

    const sub = c.querySelector('.card-head .s')!
    expect(sub.textContent).toContain("L'octroi se gère sur la carte du connecteur")
    const links = sub.querySelectorAll<HTMLAnchorElement>('a[href="/platform/connectors"]')
    expect(links).toHaveLength(1)
    links[0]!.click()
    await settle()
    expect(router.currentRoute.value.path).toBe('/platform/connectors')
    unmount()
  })
})
