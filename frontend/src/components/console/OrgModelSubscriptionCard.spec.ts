// Plafond de consommation de l'org sur les abonnements Claude de ses membres :
//   1. un membre LIT le plafond (défaut ou réglé) et qui peut le changer — aucun levier ;
//   2. l'admin saisit 1..100 et enregistre ; hors bornes, rien ne part ;
//   3. « revenir au défaut » envoie null et n'apparaît que si l'org a réglé quelque chose ;
//   4. un refus du serveur est nommé dans la carte.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { i18n } from '@/lib/i18n'
import { ApiError } from '@/api'

const api = vi.hoisted(() => ({
  getOrgModelSubscription: vi.fn(),
  setOrgModelSubscriptionLimit: vi.fn(),
}))
vi.mock('@/api/console', () => api)

const DEFAUT = {
  org_id: 7, family: 'claude_subscription', limit_pct: 80, default: true, updated_at: null, updated_by: null,
}
const REGLE = { ...DEFAUT, limit_pct: 60, default: false, updated_at: '2026-09-24T10:00:00Z', updated_by: 'u1' }

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 10; i++) await nextTick()
}

async function mountCard(canManage: boolean) {
  const Card = (await import('./OrgModelSubscriptionCard.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(Card, { orgId: 7, canManage }) })
  app.use(i18n)
  app.mount(host)
  await settle()
  return { host, unmount: () => { app.unmount(); host.remove() } }
}

const q = <T extends Element = HTMLElement>(host: HTMLElement, test: string) =>
  host.querySelector<T>(`[data-test=${test}]`)

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
})

describe('OrgModelSubscriptionCard', () => {
  it('membre : lecture du défaut, aucun levier', async () => {
    api.getOrgModelSubscription.mockResolvedValue(DEFAUT)
    const { host, unmount } = await mountCard(false)
    expect(api.getOrgModelSubscription).toHaveBeenCalledWith(7, 'claude_subscription')
    expect(q(host, 'org-limit-current')!.textContent).toContain('80 % · défaut')
    expect(q(host, 'org-limit-desc')!.textContent).toContain('le défaut de la plateforme s\'applique, 80 %')
    expect(q(host, 'org-limit-readonly')!.textContent).toContain('Seul un admin')
    expect(q(host, 'org-limit-input')).toBeNull()
    expect(host.querySelector('button')).toBeNull()
    unmount()
  })

  it('admin : saisir un plafond et l’enregistrer ; hors bornes, rien ne part', async () => {
    api.getOrgModelSubscription.mockResolvedValue(DEFAUT)
    api.setOrgModelSubscriptionLimit.mockResolvedValue(REGLE)
    const { host, unmount } = await mountCard(true)

    const input = q<HTMLInputElement>(host, 'org-limit-input')!
    expect(input.value).toBe('80')
    const save = () => q<HTMLButtonElement>(host, 'org-limit-save')!
    expect(save().disabled).toBe(true)
    expect(q(host, 'org-limit-default')).toBeNull()   // déjà au défaut

    input.value = '0'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(save().disabled).toBe(true)

    input.value = '60'
    input.dispatchEvent(new Event('input'))
    await settle()
    host.querySelector('form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(api.setOrgModelSubscriptionLimit).toHaveBeenCalledWith(7, 'claude_subscription', 60)
    expect(q(host, 'org-limit-current')!.textContent!.trim()).toBe('60 %')
    expect(q(host, 'org-limit-default')!.textContent).toContain('Revenir au défaut (80 %)')
    unmount()
  })

  it('revenir au défaut envoie null', async () => {
    api.getOrgModelSubscription.mockResolvedValue(REGLE)
    api.setOrgModelSubscriptionLimit.mockResolvedValue(DEFAUT)
    const { host, unmount } = await mountCard(true)
    q<HTMLButtonElement>(host, 'org-limit-default')!.click()
    await settle()
    expect(api.setOrgModelSubscriptionLimit).toHaveBeenCalledWith(7, 'claude_subscription', null)
    expect(q(host, 'org-limit-current')!.textContent).toContain('défaut')
    expect(q(host, 'org-limit-default')).toBeNull()
    unmount()
  })

  it('un refus du serveur est nommé dans la carte', async () => {
    api.getOrgModelSubscription.mockResolvedValue(REGLE)
    api.setOrgModelSubscriptionLimit.mockRejectedValue(new ApiError(400, 'invalid_limit'))
    const { host, unmount } = await mountCard(true)
    const input = q<HTMLInputElement>(host, 'org-limit-input')!
    input.value = '70'
    input.dispatchEvent(new Event('input'))
    await settle()
    host.querySelector('form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(q(host, 'org-limit-error')!.textContent).toContain('entier de 1 à 100')
    expect(q(host, 'org-limit-current')!.textContent!.trim()).toBe('60 %')
    unmount()
  })
})
