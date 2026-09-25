// Plafond de consommation de l'org sur les abonnements Claude de ses membres :
//   1. un membre LIT le plafond (défaut ou réglé) et qui peut le changer — aucun levier ;
//   2. l'admin saisit 1..100 et enregistre ; hors bornes, rien ne part ;
//   3. « revenir au défaut » envoie null et n'apparaît que si l'org a réglé quelque chose ;
//   4. un refus du serveur est nommé dans la carte ;
//   5. le mode : lu par un membre (et le nombre de prêteurs en pool) ; l'admin le change sur
//      geste explicite, l'avertissement du pool s'affiche AVANT l'envoi ; zéro prêteur = les
//      travaux attendent, et le lien vers le levier est dans la phrase.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { i18n } from '@/lib/i18n'
import { ApiError } from '@/api'

const api = vi.hoisted(() => ({
  getOrgModelSubscription: vi.fn(),
  setOrgModelSubscriptionLimit: vi.fn(),
  setOrgModelSubscriptionMode: vi.fn(),
}))
vi.mock('@/api/console', () => api)

const DEFAUT = {
  org_id: 7, family: 'claude_subscription', limit_pct: 80, default: true, updated_at: null, updated_by: null,
  mode: 'personnel', pool_size: 0,
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
  // Pas de routeur dans le banc : le lien vers « Mon abonnement Claude » rendu en <a>.
  app.component('RouterLink', defineComponent({
    props: { to: { type: String, required: true } },
    setup: (p, { slots }) => () => h('a', { href: p.to }, slots.default?.()),
  }))
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
    q(host, 'org-limit-form')!.dispatchEvent(new Event('submit'))
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
    q(host, 'org-limit-form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(q(host, 'org-limit-error')!.textContent).toContain('entier de 1 à 100')
    expect(q(host, 'org-limit-current')!.textContent!.trim()).toBe('60 %')
    unmount()
  })

  it('membre : le mode se lit, en pool avec le nombre de prêteurs ; aucun levier', async () => {
    api.getOrgModelSubscription.mockResolvedValue({ ...DEFAUT, mode: 'pool', pool_size: 3 })
    const { host, unmount } = await mountCard(false)
    expect(q(host, 'org-mode-current')!.textContent!.trim()).toBe('pool')
    expect(q(host, 'org-mode-desc')!.textContent).toContain('le moins récemment servi')
    expect(q(host, 'org-pool-size')!.textContent).toContain('3 membres prêtent leur abonnement')
    expect(q(host, 'org-mode-readonly')!.textContent).toContain('Seul un admin')
    expect(host.querySelector('button')).toBeNull()
    unmount()
  })

  it('pool sans prêteur : les travaux attendent, le lien vers le prêt est dans la phrase', async () => {
    api.getOrgModelSubscription.mockResolvedValue({ ...DEFAUT, mode: 'pool', pool_size: 0 })
    const { host, unmount } = await mountCard(false)
    const notice = q(host, 'org-pool-empty')!
    expect(notice.textContent).toContain('les travaux de l\'org attendent')
    expect(notice.querySelector('a')!.getAttribute('href')).toBe('/account/claude')
    expect(q(host, 'org-pool-size')).toBeNull()
    unmount()
  })

  it('admin : passer en pool avertit AVANT l’envoi, puis envoie le mode', async () => {
    api.getOrgModelSubscription.mockResolvedValue(DEFAUT)
    api.setOrgModelSubscriptionMode.mockResolvedValue({ ...DEFAUT, mode: 'pool', pool_size: 1 })
    const { host, unmount } = await mountCard(true)
    expect(q(host, 'org-mode-current')!.textContent!.trim()).toBe('personnel')
    expect(q(host, 'org-mode-save')).toBeNull()
    expect(q(host, 'org-mode-warning')).toBeNull()

    q<HTMLButtonElement>(host, 'org-mode-pool')!.click()
    await settle()
    expect(q(host, 'org-mode-warning')!.textContent).toContain('tournera sur l\'abonnement d\'une autre')
    expect(api.setOrgModelSubscriptionMode).not.toHaveBeenCalled()

    q<HTMLButtonElement>(host, 'org-mode-save')!.click()
    await settle()
    expect(api.setOrgModelSubscriptionMode).toHaveBeenCalledWith(7, 'claude_subscription', 'pool')
    expect(q(host, 'org-mode-current')!.textContent!.trim()).toBe('pool')
    expect(q(host, 'org-pool-size')!.textContent).toContain('1 membre prête son abonnement')
    expect(q(host, 'org-mode-warning')).toBeNull()
    expect(q(host, 'org-mode-save')).toBeNull()
    unmount()
  })

  it('admin : revenir en personnel se fait sans avertissement ; annuler n’envoie rien', async () => {
    api.getOrgModelSubscription.mockResolvedValue({ ...DEFAUT, mode: 'pool', pool_size: 2 })
    api.setOrgModelSubscriptionMode.mockResolvedValue(DEFAUT)
    const { host, unmount } = await mountCard(true)
    q<HTMLButtonElement>(host, 'org-mode-personnel')!.click()
    await settle()
    expect(q(host, 'org-mode-warning')).toBeNull()
    expect(q(host, 'org-mode-draft-desc')!.textContent).toContain('la personne qui l\'a demandé')
    const annuler = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Annuler'))!
    annuler.click()
    await settle()
    expect(q(host, 'org-mode-save')).toBeNull()
    expect(api.setOrgModelSubscriptionMode).not.toHaveBeenCalled()

    q<HTMLButtonElement>(host, 'org-mode-personnel')!.click()
    await settle()
    q<HTMLButtonElement>(host, 'org-mode-save')!.click()
    await settle()
    expect(api.setOrgModelSubscriptionMode).toHaveBeenCalledWith(7, 'claude_subscription', 'personnel')
    expect(q(host, 'org-mode-current')!.textContent!.trim()).toBe('personnel')
    unmount()
  })

  it('un refus du mode est nommé sous le choix, pas sous le plafond', async () => {
    api.getOrgModelSubscription.mockResolvedValue(DEFAUT)
    api.setOrgModelSubscriptionMode.mockRejectedValue(new ApiError(403, 'forbidden', 'réservé à l\'admin de l\'org'))
    const { host, unmount } = await mountCard(true)
    q<HTMLButtonElement>(host, 'org-mode-pool')!.click()
    await settle()
    q<HTMLButtonElement>(host, 'org-mode-save')!.click()
    await settle()
    expect(q(host, 'org-mode-error')).not.toBeNull()
    expect(q(host, 'org-limit-error')).toBeNull()
    expect(q(host, 'org-mode-current')!.textContent!.trim()).toBe('personnel')
    unmount()
  })
})
