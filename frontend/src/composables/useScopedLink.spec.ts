import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { useScopedLink } from './useScopedLink'

const Blank = defineComponent({ render: () => h('div') })
const routes = [
  { path: '/connectors', component: Blank, meta: { orgScoped: true } },
  { path: '/o/:orgId(\\d+)/connectors', component: Blank, meta: { orgScoped: true } },
  { path: '/o/:orgId(\\d+)/g/:groupId(\\d+)/connectors', component: Blank, meta: { orgScoped: true } },
  { path: '/account', component: Blank, meta: { orgScoped: false } },
]

// Monte un composant minimal qui expose `scoped` (le composable a besoin d'un contexte
// router). Pas de @vue/test-utils dans ce repo → createApp + jsdom à la main.
function mountScoped(router: Router): () => (p: string) => string {
  let scoped!: (p: string) => string
  const Comp = defineComponent({ setup() { scoped = useScopedLink().scoped; return () => h('div') } })
  const app = createApp(Comp)
  app.use(router)
  app.mount(document.createElement('div'))
  return () => scoped
}

describe('useScopedLink', () => {
  it('préfixe un lien org-scopé avec l\'org de l\'URL courante', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const getScoped = mountScoped(router)
    await router.push('/o/81/connectors')
    expect(getScoped()('/connectors')).toBe('/o/81/connectors')
  })

  it('préfixe org + équipe quand l\'URL porte une équipe', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const getScoped = mountScoped(router)
    await router.push('/o/81/g/7/connectors')
    expect(getScoped()('/connectors')).toBe('/o/81/g/7/connectors')
  })

  it('laisse NU un lien non org-scopé (ex. /account) même en consultation', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const getScoped = mountScoped(router)
    await router.push('/o/81/connectors')
    expect(getScoped()('/account')).toBe('/account')
  })

  it('laisse NU quand on est sur la maison (pas de préfixe dans l\'URL)', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const getScoped = mountScoped(router)
    await router.push('/connectors')
    expect(getScoped()('/connectors')).toBe('/connectors')
  })
})
