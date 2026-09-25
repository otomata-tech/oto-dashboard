// « Voir en tant que » ouvert à l'org_admin, borné à son org (oto#270) : l'entrée depuis la
// liste des membres (org figée, en-têtes posés), qui la voit, le bandeau en lecture seule
// sans offre d'écriture, le refus d'ouverture dit, et un écran hors vue qui se masque.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { i18n } from '@/lib/i18n'
import { getViewUser, setViewUser, viewHeaders } from '@/lib/viewOrg'

const api = vi.hoisted(() => ({
  getOrg: vi.fn(), setOrgMemberRole: vi.fn(), removeOrgMember: vi.fn(),
  listInvitations: vi.fn(), inviteMember: vi.fn(), revokeInvitation: vi.fn(),
  listPlatformInvitations: vi.fn(), invitePlatformUser: vi.fn(), revokePlatformInvitation: vi.fn(),
  getConnectorInstances: vi.fn(),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/composables/usePrompt', () => ({ usePrompt: () => ({ confirmAction: vi.fn(async () => true) }) }))
const me = ref<Record<string, unknown> | null>(null)
const meError = ref<string | null>(null)
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me, error: meError, reload: vi.fn() }),
}))

const ADMIN = { sub: 'u-moi', role: 'member', org_role: 'org_admin', active_org: 42, active_org_name: 'ACME' }
const ORIGIN = 'http://localhost:3000'

async function settle() {
  for (let i = 0; i < 6; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 6; i++) await nextTick()
}
let demonter: (() => void) | null = null
async function monter(charger: () => Promise<{ default: object }>) {
  const View = (await charger()).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.component('RouterLink', { props: ['to'], template: '<a :href="to"><slot /></a>' })
  app.use(i18n).mount(host)
  await settle()
  demonter = () => { app.unmount(); host.remove() }
  return host
}
const boutons = (host: HTMLElement) => [...host.querySelectorAll('[data-test="voir-en-tant-que"]')]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  i18n.global.locale.value = 'fr'
  me.value = null
  meError.value = null
  Object.defineProperty(window, 'location', {
    configurable: true, writable: true, value: { origin: ORIGIN, href: `${ORIGIN}/org`, pathname: '/org', search: '', hash: '' },
  })
  api.getOrg.mockResolvedValue({
    org: { id: 42, name: 'ACME', personal: false, my_role: 'org_admin' },
    members: [
      { sub: 'u-moi', name: 'Moi', email: 'moi@acme.test', role: 'org_admin', active: true, suspended: false },
      { sub: 'u-bob', name: 'Bob', email: 'bob@acme.test', role: 'org_member', active: true, suspended: false },
    ],
  })
  api.listInvitations.mockResolvedValue({ invitations: [] })
})
afterEach(() => { demonter?.(); demonter = null; setViewUser(null) })

describe('l’entrée depuis la liste des membres', () => {
  it('un org_admin voit le bouton sur chaque autre membre, pas sur lui-même', async () => {
    me.value = ADMIN
    const host = await monter(() => import('./OrgView.vue'))
    expect(boutons(host)).toHaveLength(1)
    expect(host.querySelector('tr:first-child [data-test="voir-en-tant-que"]')).toBeNull()
  })

  it('entrer fige l’org et pose les deux en-têtes', async () => {
    me.value = ADMIN
    const host = await monter(() => import('./OrgView.vue'))
    ;(boutons(host)[0] as HTMLButtonElement).click()
    expect(getViewUser()).toEqual({ sub: 'u-bob', name: 'Bob', org: { id: 42, name: 'ACME' } })
    expect(viewHeaders()).toEqual({ 'X-Oto-View-As': 'u-bob', 'X-Oto-Org': '42' })
    expect(window.location.href).toBe('/overview')
  })

  it.each([
    ['un membre simple', { ...ADMIN, org_role: 'org_member' }],
    ['un opérateur qui consulte l’org', { ...ADMIN, role: 'super_admin', org_role: null, active_org_readonly: true }],
    ['un super_admin sans rôle réel dans l’org', { ...ADMIN, role: 'super_admin', org_role: null }],
    ['déjà en vue « en tant que »', { ...ADMIN, view_as_read_only: true }],
  ])('pas de bouton pour %s', async (_nom, porteur) => {
    me.value = porteur
    const host = await monter(() => import('./OrgView.vue'))
    expect(boutons(host)).toHaveLength(0)
  })
})

describe('le bandeau d’une vue bornée', () => {
  it('nomme la cible et l’org, en lecture seule, sans offre d’écriture', async () => {
    setViewUser({ sub: 'u-bob', name: 'Bob', org: { id: 42, name: 'ACME' } })
    me.value = { sub: 'u-bob', role: 'member', org_role: 'org_member', view_as_read_only: true }
    const host = await monter(() => import('@/components/console/ViewAsBanner.vue'))
    expect(host.textContent).toContain('Tu vois ce que voit Bob dans ACME, en lecture seule.')
    expect(host.querySelector('[data-test="viewas-write"]')).toBeNull()
  })

  it('« quitter » ramène aux membres de l’org', async () => {
    setViewUser({ sub: 'u-bob', name: 'Bob', org: { id: 42, name: 'ACME' } })
    const host = await monter(() => import('@/components/console/ViewAsBanner.vue'))
    const quitter = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Quitter')
      || b.textContent?.includes('quitter'))!
    quitter.click()
    expect(getViewUser()).toBeNull()
    expect(window.location.href).toBe('/org')
  })

  it.each([
    ['400 view_as_org_required', 'l\'org n\'a pas été transmise'],
    ['403 view_as_hors_org', 'pas (ou plus) un membre de ton org'],
    ['403 forbidden', 'pas (ou plus) admin de cette org'],
  ])('un refus d’ouverture (%s) se dit, avec « quitter »', async (refus, phrase) => {
    setViewUser({ sub: 'u-bob', name: 'Bob', org: { id: 42, name: 'ACME' } })
    meError.value = refus
    const host = await monter(() => import('@/components/console/ViewAsBanner.vue'))
    expect(host.querySelector('[data-test="viewas-refus"]')?.textContent).toContain(phrase)
    expect([...host.querySelectorAll('button')].length).toBeGreaterThan(0)
  })
})

describe('un écran hors de la vue se masque, sans erreur', () => {
  it('les routines lisent une liste refusée : la carte disparaît, aucune alerte', async () => {
    const { ApiError } = await import('@/api')
    api.getConnectorInstances.mockRejectedValue(new ApiError(403, 'view_as_hors_org'))
    const host = await monter(() => import('@/components/console/automations/RoutinesSection.vue'))
    expect(host.textContent?.trim()).toBe('')
    expect(host.querySelector('.au-err')).toBeNull()
  })

  it('contre-épreuve : une autre erreur reste dite', async () => {
    const { ApiError } = await import('@/api')
    api.getConnectorInstances.mockRejectedValue(new ApiError(500, 'boom'))
    const host = await monter(() => import('@/components/console/automations/RoutinesSection.vue'))
    expect(host.querySelector('.au-err')).not.toBeNull()
  })
})
