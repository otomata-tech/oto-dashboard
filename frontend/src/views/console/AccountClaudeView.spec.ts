// « Mon abonnement Claude » : ce que le parcours de connexion doit garantir.
//   1. login → code → connecté, sans jamais recharger ni deviner l'état : c'est la
//      réponse du PUT code qui dit « connecté » et le palier ;
//   2. le 403 `subscription_not_enabled` (chemin ouvert à des personnes nommées, aucune
//      lecture ne le dit avant) se DIT, et le bouton qui échouerait disparaît ;
//   3. effacer le sandbox passe par la modale de la console, jamais `window.confirm`, et
//      renoncer n'appelle rien ;
//   4. un statut hors de l'ensemble fermé lève au lieu d'être affiché comme un autre.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import { i18n } from '@/lib/i18n'
import { ApiError } from '@/api'
import { usePrompt } from '@/composables/usePrompt'

const api = vi.hoisted(() => ({
  getModelSubscriptions: vi.fn(),
  startModelSubscriptionLogin: vi.fn(),
  sendModelSubscriptionCode: vi.fn(),
  removeModelSubscription: vi.fn(),
}))
vi.mock('@/api/console', () => api)

const CONNECTE = {
  family: 'claude_subscription', statut: 'connected', plan: 'max',
  limit_reset_at: null, last_ok_at: null, waiting_jobs: 2,
}

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 10; i++) await nextTick()
}

async function mountView() {
  const View = (await import('./AccountClaudeView.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.use(i18n)
  app.mount(host)
  await settle()
  return { host, unmount: () => { app.unmount(); host.remove() } }
}

const bouton = (host: HTMLElement, texte: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(texte))

let openSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
})
afterEach(() => openSpy.mockRestore())

describe('useModelSubscription — le parcours', () => {
  it('login → code → connecté : l’état vient de la réponse du PUT', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [] })
    api.startModelSubscriptionLogin.mockResolvedValue({ url: 'https://claude.ai/oauth?x=1' })
    api.sendModelSubscriptionCode.mockResolvedValue(CONNECTE)
    const { useModelSubscription } = await import('@/lib/modelSubscription')
    const f = useModelSubscription()

    await f.load()
    expect(f.etat.value).toBe('none')

    expect(await f.start()).toBe('https://claude.ai/oauth?x=1')
    expect(f.step.value).toBe('code')

    expect(await f.submitCode('  abc#def  ')).toBe(true)
    expect(api.sendModelSubscriptionCode).toHaveBeenCalledWith('claude_subscription', 'abc#def')
    expect(f.etat.value).toBe('connected')
    expect(f.step.value).toBe('idle')
    expect(f.loginUrl.value).toBeNull()
  })

  it('un code refusé laisse l’étape ouverte, avec le refus nommé', async () => {
    api.startModelSubscriptionLogin.mockResolvedValue({ url: 'https://claude.ai/oauth' })
    api.sendModelSubscriptionCode.mockRejectedValue(new ApiError(422, 'login_failed'))
    const { useModelSubscription, errorKey } = await import('@/lib/modelSubscription')
    const f = useModelSubscription()
    await f.start()
    expect(await f.submitCode('mauvais')).toBe(false)
    expect(f.step.value).toBe('code')
    expect(errorKey(f.error.value)).toBe('modelSub.errors.login_failed')
  })

  it('le 403 subscription_not_enabled est un état, pas une erreur', async () => {
    api.startModelSubscriptionLogin.mockRejectedValue(new ApiError(403, 'subscription_not_enabled'))
    const { useModelSubscription } = await import('@/lib/modelSubscription')
    const f = useModelSubscription()
    expect(await f.start()).toBeNull()
    expect(f.notEnabled.value).toBe(true)
    expect(f.error.value).toBeNull()
    expect(f.step.value).toBe('idle')
  })

  it('un statut inconnu lève', async () => {
    const { statutOf } = await import('@/lib/modelSubscription')
    expect(() => statutOf({ ...CONNECTE, statut: 'quelque_chose' })).toThrow(/inconnu/)
  })
})

describe('AccountClaudeView — l’écran', () => {
  it('parcours complet : bouton, onglet ouvert, code, connecté (palier et travaux en attente)', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [] })
    api.startModelSubscriptionLogin.mockResolvedValue({ url: 'https://claude.ai/oauth?x=1' })
    api.sendModelSubscriptionCode.mockResolvedValue(CONNECTE)
    const { host, unmount } = await mountView()

    expect(host.querySelector('[data-test=etat]')!.textContent).toContain('non connecté')
    bouton(host, 'Connecter mon abonnement Claude')!.click()
    await settle()

    expect(openSpy).toHaveBeenCalledWith('https://claude.ai/oauth?x=1', '_blank', 'noopener')
    // Une action à la fois : plus de bouton de connexion, le lien de secours est là.
    expect(bouton(host, 'Connecter mon abonnement Claude')).toBeUndefined()
    expect(host.querySelector<HTMLAnchorElement>('[data-test=fallback]')!.href)
      .toBe('https://claude.ai/oauth?x=1')
    expect(host.textContent).toContain('Team ou Enterprise')

    const input = host.querySelector<HTMLInputElement>('input.inp')!
    input.value = 'CODE-123'
    input.dispatchEvent(new Event('input'))
    await settle()
    host.querySelector('form')!.dispatchEvent(new Event('submit'))
    await settle()

    expect(api.sendModelSubscriptionCode).toHaveBeenCalledWith('claude_subscription', 'CODE-123')
    expect(host.querySelector('[data-test=etat]')!.textContent!.trim()).toBe('connecté')
    expect(host.textContent).toContain('palier max')
    expect(host.querySelector('[data-test=waiting]')!.textContent).toContain('2 travaux attendent')
    expect(host.querySelector('input.inp')).toBeNull()
    unmount()
  })

  it('le 403 au clic : l’écran dit que l’option n’est pas ouverte et retire le bouton', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [] })
    api.startModelSubscriptionLogin.mockRejectedValue(new ApiError(403, 'subscription_not_enabled'))
    const { host, unmount } = await mountView()

    bouton(host, 'Connecter mon abonnement Claude')!.click()
    await settle()

    expect(openSpy).not.toHaveBeenCalled()
    expect(host.querySelector('[data-test=not-enabled]')!.textContent)
      .toContain("Cette option n'est pas ouverte sur ton compte")
    expect(bouton(host, 'Connecter mon abonnement Claude')).toBeUndefined()
    expect(host.querySelector('[data-test=error]')).toBeNull()
    unmount()
  })

  it('effacer le sandbox demande confirmation dans la console ; renoncer n’appelle rien', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [CONNECTE] })
    const nativeConfirm = vi.spyOn(window, 'confirm')
    const { host, unmount } = await mountView()
    const { state, resolve } = usePrompt()

    bouton(host, 'Effacer mon sandbox')!.click()
    await settle()
    expect(state.value?.kind).toBe('confirm')
    expect(state.value?.kind === 'confirm' && state.value.config.message).toContain('irréversible')
    resolve(false)
    await settle()
    expect(api.removeModelSubscription).not.toHaveBeenCalled()

    api.removeModelSubscription.mockResolvedValue({ ok: true, family: 'claude_subscription', sandbox_destroyed: true })
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [] })
    bouton(host, 'Effacer mon sandbox')!.click()
    await settle()
    resolve(true)
    await settle()
    expect(api.removeModelSubscription).toHaveBeenCalledWith('claude_subscription', true)
    expect(host.querySelector('[data-test=etat]')!.textContent).toContain('non connecté')
    expect(nativeConfirm).not.toHaveBeenCalled()
    nativeConfirm.mockRestore()
    unmount()
  })

  it('en pause : la date de reprise est dite', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [{
      ...CONNECTE, statut: 'paused_limit', waiting_jobs: 0, limit_reset_at: '2026-09-25T10:00:00Z',
    }] })
    const { host, unmount } = await mountView()
    expect(host.querySelector('[data-test=etat]')!.textContent).toContain('en pause')
    expect(host.querySelector('[data-test=etat-desc]')!.textContent).toContain('en pause jusqu')
    expect(host.querySelector('[data-test=waiting]')).toBeNull()
    expect(bouton(host, 'Connecter')).toBeUndefined()
    unmount()
  })
})
