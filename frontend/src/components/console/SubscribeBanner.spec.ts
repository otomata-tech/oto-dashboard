// Le bandeau d'incitation à l'abonnement — QUI le voit, et quand il se tait.
//
// Décision d'Alexis (09/09/2026) : permanent, toutes pages, admins d'org seulement.
// Ce qui se teste ici n'est pas la copie mais les QUATRE silences qui la rendent
// juste : un membre simple n'a pas le levier ; une org abonnée n'a rien à acheter ;
// une org qui possède déjà un don ne doit pas se voir revendre ce qu'elle a (lot du
// 02/09) ; et la page facturation porte déjà le levier. Chaque silence est prouvé
// par son contraire : le même monde, un seul fait changé, et le bandeau apparaît.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/lib/i18n'
import type { BillingStatus } from '@/types/api'

const api = vi.hoisted(() => ({ getBilling: vi.fn() }))
vi.mock('@/api/console', () => api)
const { getBilling } = api

type MeLite = { sub: string; org_role: string | null; active_org: number | null; active_org_readonly?: boolean }
const me = ref<MeLite | null>(null)
vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me }) }))

const LIBRE: BillingStatus = { subscribed: false, plans: [], granted: [] }
const ABONNEE: BillingStatus = { subscribed: true, plan: 'standard', granted: [] }
const DOTEE: BillingStatus = {
  subscribed: false, plans: [],
  granted: [{ option: 'unipile', label: 'Messagerie hébergée', detail: null, scope: 'org',
    granted_at: '2026-08-01 00:00:00', expires_at: null, days_left: null,
    value_amount: 1900, currency: 'eur', interval: 'month' } as never],
}

const Vide = defineComponent({ render: () => h('div') })

async function mountBanner(path = '/overview') {
  const Banner = (await import('./SubscribeBanner.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/overview', component: Vide, meta: { section: '/overview', orgScoped: true } },
      { path: '/org/billing', component: Vide, meta: { section: '/org/billing', orgScoped: true } },
      { path: '/o/:orgId(\\d+)/overview', component: Vide, meta: { section: '/overview', orgScoped: true } },
      { path: '/o/:orgId(\\d+)/org/billing', component: Vide, meta: { section: '/org/billing', orgScoped: true } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(Banner)
  app.use(router)
  app.use(i18n)
  app.mount(host)
  await settle()
  return { host, router, unmount: () => { app.unmount(); host.remove() } }
}

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

const admin = (over: Partial<MeLite> = {}): MeLite =>
  ({ sub: 'u-1', org_role: 'org_admin', active_org: 42, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  me.value = null
})

describe('SubscribeBanner — il s\'adresse à qui peut souscrire', () => {
  it('un admin d\'une org libre le voit, avec son levier vers la facturation', async () => {
    me.value = admin()
    getBilling.mockResolvedValue(LIBRE)
    const { host, unmount } = await mountBanner()
    expect(host.textContent).toContain('choisir un abonnement')
    const lien = host.querySelector('a')
    expect(lien?.getAttribute('href')).toBe('/org/billing')
    unmount()
  })

  it('en consultation d\'org (/o/:id), le levier reste dans l\'org consultée', async () => {
    me.value = admin()
    getBilling.mockResolvedValue(LIBRE)
    const { host, unmount } = await mountBanner('/o/42/overview')
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/o/42/org/billing')
    unmount()
  })

  it('un membre simple ne le voit pas — et le statut n\'est même pas demandé', async () => {
    me.value = admin({ org_role: 'member' })
    getBilling.mockResolvedValue(LIBRE)
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    expect(getBilling).not.toHaveBeenCalled()
    unmount()
  })

  it('un opérateur qui CONSULTE une org en lecture seule ne le voit pas', async () => {
    me.value = admin({ active_org_readonly: true })
    getBilling.mockResolvedValue(LIBRE)
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    expect(getBilling).not.toHaveBeenCalled()
    unmount()
  })
})

describe('SubscribeBanner — il se tait quand il n\'y a rien à vendre', () => {
  it('org abonnée : silence', async () => {
    me.value = admin()
    getBilling.mockResolvedValue(ABONNEE)
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    unmount()
  })

  it('org qui possède déjà un avantage offert : silence (on ne revend pas ce qu\'elle a)', async () => {
    me.value = admin()
    getBilling.mockResolvedValue(DOTEE)
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    unmount()
  })

  it('sur la page facturation elle-même : silence, le levier est déjà là', async () => {
    me.value = admin()
    getBilling.mockResolvedValue(LIBRE)
    const { host, unmount } = await mountBanner('/org/billing')
    expect(host.textContent).not.toContain('abonnement')
    unmount()
  })

  it('facturation indisponible côté serveur : silence, sans casser la console', async () => {
    me.value = admin()
    getBilling.mockRejectedValue(new Error('404'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    unmount()
  })
})

describe('SubscribeBanner — il se rafraîchit là où l\'état change', () => {
  it('quitter la facturation relit le statut : une souscription qui vient d\'aboutir le fait disparaître', async () => {
    me.value = admin()
    getBilling.mockResolvedValue(LIBRE)
    const { host, router, unmount } = await mountBanner()
    expect(host.textContent).toContain('choisir un abonnement')

    await router.push('/org/billing')
    await settle()
    expect(host.textContent).not.toContain('abonnement')

    getBilling.mockResolvedValue(ABONNEE)
    await router.push('/overview')
    await settle()
    expect(getBilling).toHaveBeenCalledTimes(2)
    expect(host.textContent).not.toContain('abonnement')
    unmount()
  })

  it('changer d\'org active relit le statut', async () => {
    me.value = admin()
    getBilling.mockResolvedValue(LIBRE)
    const { unmount } = await mountBanner()
    expect(getBilling).toHaveBeenCalledTimes(1)
    me.value = admin({ active_org: 43 })
    await settle()
    expect(getBilling).toHaveBeenCalledTimes(2)
    unmount()
  })
})
