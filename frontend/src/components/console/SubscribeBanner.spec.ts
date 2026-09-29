// Le bandeau d'incitation à l'abonnement — QUI le voit, et quand il se tait.
//
// Décision d'Alexis (09/09/2026) : permanent, toutes pages, admins d'org seulement ; et
// (29/09/2026) dans une org d'ÉQUIPE seulement, jamais dans l'org perso.
// Ce qui se teste ici n'est pas la copie mais les silences qui la rendent juste : un
// membre simple n'a pas le levier ; une org abonnée n'a rien à acheter ; une org en essai
// ou qui possède déjà un don ne doit pas se voir revendre ce qu'elle a (lot du 02/09) ;
// une org sous contrat a déjà payé, hors plateforme ; et la page facturation porte déjà
// le levier. Chaque silence est prouvé par son
// contraire : le même monde, un seul fait changé, et le bandeau apparaît.
//
// L'état vient d'oto-commerce : `GET /orgs/{id}/abonnement` (404 `no_subscription` = non
// abonnée), `GET /orgs/{id}/contrat` (404 `no_contract` = aucun) et
// `GET /orgs/{id}/avantages`. Le transport est bouchonné, les routes sont
// celles que compose le vrai `api/console`.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/lib/i18n'
import type { CommerceAbonnement, CommerceAvantages, CommerceContrat } from '@/types/api.commerce'

const commerce = vi.hoisted(() => ({ apiCommerce: vi.fn(), apiCommerceDownload: vi.fn() }))
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()), ...commerce,
}))
import { ApiError } from '@/api'

type MeLite = {
  sub: string; org_role: string | null; active_org: number | null; active_org_readonly?: boolean
  view_as_read_only?: boolean; active_org_is_personal?: boolean
}
const me = ref<MeLite | null>(null)
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me }),
}))

// Le monde côté commerce : l'abonnement et le contrat (null = 404), les avantages de l'org.
const monde: {
  abonnement: Partial<CommerceAbonnement> | null; contrat: CommerceContrat | null; avantages: CommerceAvantages
} = { abonnement: null, contrat: null, avantages: { essai: null, dons: [] } }
const contrat = (fin: string | null): CommerceContrat => ({
  licences: 12, droits: ['unipile'], debut: '2026-01-01T00:00:00+00:00', fin, reference: 'BC-2026-007',
})
const appels: string[] = []
function servir() {
  commerce.apiCommerce.mockImplementation(async (path: string) => {
    appels.push(path)
    if (/^\/api\/orgs\/\d+\/abonnement$/.test(path)) {
      if (!monde.abonnement) throw new ApiError(404, 'no_subscription', 'pas d\'abonnement')
      return monde.abonnement
    }
    if (/^\/api\/orgs\/\d+\/contrat$/.test(path)) {
      if (!monde.contrat) throw new ApiError(404, 'no_contract', 'pas de contrat')
      return monde.contrat
    }
    if (/^\/api\/orgs\/\d+\/avantages$/.test(path)) return monde.avantages
    throw new Error(`route inattendue : ${path}`)
  })
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
  appels.length = 0
  monde.abonnement = null
  monde.contrat = null
  monde.avantages = { essai: null, dons: [] }
  servir()
})

describe('SubscribeBanner — il s\'adresse à qui peut souscrire', () => {
  it('un admin d\'une org libre le voit, avec son levier vers la facturation', async () => {
    me.value = admin()
    const { host, unmount } = await mountBanner()
    expect(host.textContent).toContain('choisir un abonnement')
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/org/billing')
    // L'org est dans le chemin, jamais implicite.
    expect(appels).toEqual(expect.arrayContaining(
      ['/api/orgs/42/abonnement', '/api/orgs/42/contrat', '/api/orgs/42/avantages']))
    unmount()
  })

  it('en consultation d\'org (/o/:id), le levier reste dans l\'org consultée', async () => {
    me.value = admin()
    const { host, unmount } = await mountBanner('/o/42/overview')
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/o/42/org/billing')
    unmount()
  })

  it('un membre simple ne le voit pas — et le commerce n\'est même pas appelé', async () => {
    me.value = admin({ org_role: 'member' })
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    expect(commerce.apiCommerce).not.toHaveBeenCalled()
    unmount()
  })

  // oto#212 : vu « en tant que » un admin d'org, le profil servi a ses rôles, mais le
  // commerce relit le rôle du porteur du jeton — le levier serait un bouton qui échoue.
  it('vu « en tant que » un admin d\'org, il ne le voit pas non plus', async () => {
    me.value = admin({ view_as_read_only: true })
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    expect(commerce.apiCommerce).not.toHaveBeenCalled()
    unmount()
  })

  // Décision d'Alexis (29/09/2026) : on ne pousse à s'abonner que dans une org d'équipe.
  it('dans son org PERSO, l\'admin ne le voit pas — et le commerce n\'est pas appelé', async () => {
    me.value = admin({ active_org_is_personal: true })
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    expect(commerce.apiCommerce).not.toHaveBeenCalled()
    unmount()
  })

  it('dans une org d\'ÉQUIPE qui n\'a rien, il le voit', async () => {
    me.value = admin({ active_org_is_personal: false })
    const { host, unmount } = await mountBanner()
    expect(host.textContent).toContain('choisir un abonnement')
    unmount()
  })

  it('un opérateur qui CONSULTE une org en lecture seule ne le voit pas', async () => {
    me.value = admin({ active_org_readonly: true })
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    expect(commerce.apiCommerce).not.toHaveBeenCalled()
    unmount()
  })
})

describe('SubscribeBanner — il se tait quand il n\'y a rien à vendre', () => {
  it('org abonnée : silence', async () => {
    me.value = admin()
    monde.abonnement = { statut: 'active', places: 3 }
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    unmount()
  })

  it('org dont l\'abonnement est résilié et échu : le bandeau revient', async () => {
    me.value = admin()
    monde.abonnement = { statut: 'canceled', places: 3 }
    const { host, unmount } = await mountBanner()
    expect(host.textContent).toContain('choisir un abonnement')
    unmount()
  })

  // Un abonnement réglé hors plateforme : l'org a payé, le commerce refuserait d'ailleurs
  // la souscription (409 under_contract). Sans contrat (404 no_contract), le bandeau vit.
  it('org sous contrat : silence tant qu\'il court (sans échéance ou à venir)', async () => {
    me.value = admin()
    for (const fin of [null, '2999-01-01T00:00:00+00:00']) {
      monde.contrat = contrat(fin)
      const { host, unmount } = await mountBanner()
      expect(host.textContent, String(fin)).not.toContain('abonnement')
      unmount()
    }
  })

  it('org dont le contrat est CLOS : le bandeau revient', async () => {
    me.value = admin()
    monde.contrat = contrat('2020-01-01T00:00:00+00:00')
    const { host, unmount } = await mountBanner()
    expect(host.textContent).toContain('choisir un abonnement')
    unmount()
  })

  it('org qui possède déjà un don : silence (on ne revend pas ce qu\'elle a)', async () => {
    me.value = admin()
    monde.avantages = { essai: null, dons: [{ droit: 'unipile', fin: null }] }
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    unmount()
  })

  it('org en essai : silence tant qu\'il court ; un essai ÉCHU ne fait plus taire', async () => {
    me.value = admin()
    monde.avantages = { essai: { fin: '2999-01-01T00:00:00+00:00' }, dons: [] }
    const enCours = await mountBanner()
    expect(enCours.host.textContent).not.toContain('abonnement')
    enCours.unmount()

    monde.avantages = { essai: { fin: '2020-01-01T00:00:00+00:00' }, dons: [] }
    const echu = await mountBanner()
    expect(echu.host.textContent).toContain('choisir un abonnement')
    echu.unmount()
  })

  it('sur la page facturation elle-même : silence, le levier est déjà là', async () => {
    me.value = admin()
    const { host, unmount } = await mountBanner('/org/billing')
    expect(host.textContent).not.toContain('abonnement')
    unmount()
  })

  it('commerce indisponible : silence, sans casser la console', async () => {
    me.value = admin()
    commerce.apiCommerce.mockRejectedValue(new ApiError(404, 'unknown_org'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { host, unmount } = await mountBanner()
    expect(host.textContent).not.toContain('abonnement')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    unmount()
  })
})

describe('SubscribeBanner — il se rafraîchit là où l\'état change', () => {
  it('quitter la facturation relit l\'état : une souscription qui vient d\'aboutir le fait disparaître', async () => {
    me.value = admin()
    const { host, router, unmount } = await mountBanner()
    expect(host.textContent).toContain('choisir un abonnement')

    await router.push('/org/billing')
    await settle()
    expect(host.textContent).not.toContain('abonnement')

    monde.abonnement = { statut: 'active', places: 1 }
    await router.push('/overview')
    await settle()
    expect(appels.filter((p) => p.endsWith('/abonnement'))).toHaveLength(2)
    expect(host.textContent).not.toContain('abonnement')
    unmount()
  })

  it('changer d\'org active relit l\'état, pour la nouvelle org', async () => {
    me.value = admin()
    const { unmount } = await mountBanner()
    expect(appels.filter((p) => p.endsWith('/abonnement'))).toEqual(['/api/orgs/42/abonnement'])
    me.value = admin({ active_org: 43 })
    await settle()
    expect(appels.filter((p) => p.endsWith('/abonnement')))
      .toEqual(['/api/orgs/42/abonnement', '/api/orgs/43/abonnement'])
    unmount()
  })
})
