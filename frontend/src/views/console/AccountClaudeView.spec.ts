// « Mon abonnement Claude » : ce que le parcours de connexion doit garantir.
//   1. login → code → connecté, sans jamais recharger ni deviner l'état : c'est la
//      réponse du PUT code qui dit « connecté » et le palier ;
//   2. le 403 `subscription_not_enabled` (chemin ouvert à des personnes nommées, aucune
//      lecture ne le dit avant) se DIT, et le bouton qui échouerait disparaît ;
//   3. effacer le sandbox passe par la modale de la console, jamais `window.confirm`, et
//      renoncer n'appelle rien ;
//   4. un statut hors de l'ensemble fermé lève au lieu d'être affiché comme un autre ;
//   5. le plafond perso : entier 1..100 ou null, jamais envoyé invalide, enregistré sur
//      geste explicite, refus nommé sous le réglage ;
//   6. le prêt au pool : une case par org (espace perso écarté), cochable seulement en mode
//      pool (la raison dite sinon), un prêt existant toujours retirable, et c'est l'ensemble
//      COMPLET `lent_to` qui part ; un refus est nommé sous les cases.
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
  setModelSubscriptionLimit: vi.fn(),
  setModelSubscriptionLending: vi.fn(),
  getMyOrgs: vi.fn(),
  getOrgModelSubscription: vi.fn(),
}))
vi.mock('@/api/console', () => api)

const CONNECTE = {
  family: 'claude_subscription', statut: 'connected', plan: 'max',
  limit_reset_at: null, last_ok_at: null, limit_pct: null as number | null, waiting_jobs: 2,
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
  api.getMyOrgs.mockResolvedValue({ orgs: [] })
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

describe('plafond de consommation — la logique', () => {
  it('bornes : entier de 1 à 100, ou null', async () => {
    const { isValidLimit, parseLimitInput } = await import('@/lib/modelSubscription')
    expect(isValidLimit(null)).toBe(true)
    expect(isValidLimit(1)).toBe(true)
    expect(isValidLimit(100)).toBe(true)
    expect(isValidLimit(0)).toBe(false)
    expect(isValidLimit(101)).toBe(false)
    expect(isValidLimit(50.5)).toBe(false)
    expect(parseLimitInput(' 60 ')).toBe(60)
    expect(parseLimitInput(60)).toBe(60)
    for (const bad of ['', '0', '101', '12.5', '-3', 'abc', null, undefined]) {
      expect(parseLimitInput(bad)).toBeUndefined()
    }
  })

  it('le brouillon suit la valeur enregistrée ; dirty = valide et différent', async () => {
    const { ref } = await import('vue')
    const { useLimitDraft } = await import('@/lib/modelSubscription')
    const saved = ref<number | null>(null)
    const d = useLimitDraft(() => saved.value)
    expect(d.own.value).toBe(false)
    expect(d.value.value).toBeNull()
    expect(d.dirty.value).toBe(false)

    d.own.value = true
    expect(d.invalid.value).toBe(true)      // aucun chiffre saisi : rien à envoyer
    expect(d.dirty.value).toBe(false)
    d.text.value = '150'
    expect(d.invalid.value).toBe(true)
    d.text.value = '60'
    expect(d.value.value).toBe(60)
    expect(d.dirty.value).toBe(true)

    saved.value = 60                        // enregistré : le brouillon se recale
    await nextTick()
    expect(d.own.value).toBe(true)
    expect(d.text.value).toBe(60)
    expect(d.dirty.value).toBe(false)
    d.own.value = false                     // retirer son plafond = envoyer null
    expect(d.value.value).toBeNull()
    expect(d.dirty.value).toBe(true)
  })

  it('setLimit : la réponse relue fait foi ; un refus est retenu à part', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [CONNECTE] })
    api.setModelSubscriptionLimit.mockResolvedValue({ ...CONNECTE, limit_pct: 40 })
    const { useModelSubscription, errorKey } = await import('@/lib/modelSubscription')
    const f = useModelSubscription()
    await f.load()
    expect(await f.setLimit(40)).toBe(true)
    expect(api.setModelSubscriptionLimit).toHaveBeenCalledWith('claude_subscription', 40)
    expect(f.sub.value?.limit_pct).toBe(40)

    api.setModelSubscriptionLimit.mockRejectedValue(new ApiError(400, 'invalid_limit'))
    expect(await f.setLimit(40)).toBe(false)
    expect(errorKey(f.limitError.value)).toBe('modelSub.errors.invalid_limit')
    expect(f.error.value).toBeNull()        // l'état de connexion n'en est pas touché
    expect(f.sub.value?.limit_pct).toBe(40)
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

  it('sans abonnement, pas de réglage de plafond', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [] })
    const { host, unmount } = await mountView()
    expect(host.querySelector('[data-test=limit-card]')).toBeNull()
    unmount()
  })

  it('plafond perso : saisir, enregistrer ; hors bornes, le bouton reste inerte', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [CONNECTE] })
    api.setModelSubscriptionLimit.mockResolvedValue({ ...CONNECTE, limit_pct: 60 })
    const { host, unmount } = await mountView()

    expect(host.querySelector('[data-test=limit-current]')!.textContent).toContain('aucun plafond perso')
    expect(host.querySelector('[data-test=limit-rule]')!.textContent)
      .toContain('le plus strict entre le plafond de l\'org qui lance le run (80 % par défaut')
    expect(host.textContent).toContain('le run en cours finit')
    const save = () => host.querySelector<HTMLButtonElement>('[data-test=limit-save]')!
    expect(save().disabled).toBe(true)
    expect(host.querySelector('[data-test=limit-input]')).toBeNull()

    host.querySelector<HTMLButtonElement>('[data-test=limit-own]')!.click()
    await settle()
    const input = host.querySelector<HTMLInputElement>('[data-test=limit-input]')!
    input.value = '150'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(save().disabled).toBe(true)

    input.value = '60'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(save().disabled).toBe(false)
    host.querySelector('[data-test=limit-card] form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(api.setModelSubscriptionLimit).toHaveBeenCalledWith('claude_subscription', 60)
    expect(host.querySelector('[data-test=limit-current]')!.textContent).toContain('60 %')
    expect(save().disabled).toBe(true)
    unmount()
  })

  it('retirer son plafond envoie null ; un refus du serveur est nommé sous le réglage', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [{ ...CONNECTE, limit_pct: 50 }] })
    api.setModelSubscriptionLimit.mockRejectedValue(new ApiError(404, 'not_connected'))
    const { host, unmount } = await mountView()

    expect(host.querySelector('[data-test=limit-current]')!.textContent).toContain('50 %')
    host.querySelector<HTMLButtonElement>('[data-test=limit-none]')!.click()
    await settle()
    host.querySelector('[data-test=limit-card] form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(api.setModelSubscriptionLimit).toHaveBeenCalledWith('claude_subscription', null)
    expect(host.querySelector('[data-test=limit-error]')!.textContent)
      .toContain("Aucun abonnement Claude n'est branché")
    expect(host.querySelector('[data-test=error]')).toBeNull()
    unmount()
  })
})

// ── prêt au pool ────────────────────────────────────────────────────────────────
const org = (id: number, name: string, personal = false) => ({
  id, name, personal, logo_url: null, logo_custom: false, description: '', domain: null,
  industry: '', location: '', member_count: 3, my_role: 'org_member',
})
const CAP = (org_id: number, mode: string, pool_size = 0) => ({
  org_id, family: 'claude_subscription', limit_pct: 80, default: true, updated_at: null, updated_by: null,
  mode, pool_size,
})
// Perso (écartée), Acme en pool (2 prêteurs), Beta en personnel, Gamma en pool.
function mesOrgs() {
  api.getMyOrgs.mockResolvedValue({ orgs: [org(1, 'Perso', true), org(7, 'Acme'), org(8, 'Beta'), org(9, 'Gamma')] })
  api.getOrgModelSubscription.mockImplementation(async (id: number) =>
    ({ 7: CAP(7, 'pool', 2), 8: CAP(8, 'personnel'), 9: CAP(9, 'pool', 0) } as Record<number, unknown>)[id])
}
const caseDe = (host: HTMLElement, id: number) =>
  host.querySelector<HTMLInputElement>(`[data-test=lend-org-${id}] input[type=checkbox]`)!
async function cocher(host: HTMLElement, id: number, on: boolean) {
  const c = caseDe(host, id)
  c.checked = on
  c.dispatchEvent(new Event('change'))
  await settle()
}
const soumettre = async (host: HTMLElement) => {
  host.querySelector('[data-test=lend-card] form')!.dispatchEvent(new Event('submit'))
  await settle()
}

describe('prêt au pool — la logique', () => {
  it('modeOf resserre sur personnel | pool, et lève sur l’inconnu', async () => {
    const { modeOf } = await import('@/lib/modelSubscription')
    expect(modeOf({ mode: 'pool' })).toBe('pool')
    expect(modeOf({ mode: 'personnel' })).toBe('personnel')
    expect(() => modeOf({ mode: 'mutualise' })).toThrow(/mode d'abonnement inconnu/)
  })

  it('le brouillon : pool cochable, personnel non, prêt existant toujours retirable ; payload borné et trié', async () => {
    const { ref } = await import('vue')
    const { useLendingDraft } = await import('@/lib/modelSubscription')
    const saved = ref<number[]>([8])
    const d = useLendingDraft(() => saved.value, () => [1, 7, 8, 9])
    const o = (id: number, mode: 'pool' | 'personnel' | null) => ({ org: org(id, 'x'), mode, poolSize: null })
    expect(d.canToggle(o(7, 'pool'))).toBe(true)
    expect(d.canToggle(o(9, 'personnel'))).toBe(false)
    expect(d.canToggle(o(8, 'personnel'))).toBe(true)   // prêt existant : on peut le retirer
    expect(d.canToggle(o(9, null))).toBe(false)
    expect(d.dirty.value).toBe(false)
    d.toggle(9, true)
    d.toggle(7, true)
    d.toggle(42, true)                                     // plus membre : jamais envoyée
    expect(d.payload.value).toEqual([7, 8, 9])
    expect(d.dirty.value).toBe(true)
    saved.value = [7, 8, 9]
    await Promise.resolve()
    expect(d.dirty.value).toBe(false)
  })
})

describe('AccountClaudeView — prêter au pool', () => {
  it('une case par org (perso écartée) ; hors pool la case est fermée et la raison dite', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [{ ...CONNECTE, lent_to: [] }] })
    mesOrgs()
    const { host, unmount } = await mountView()
    expect(api.getOrgModelSubscription).toHaveBeenCalledTimes(3)
    expect(host.querySelector('[data-test=lend-org-1]')).toBeNull()
    expect(host.querySelector('[data-test=lend-rule]')!.textContent).toContain('ton forfait qui est consommé')
    expect(host.querySelector('[data-test=lend-note-7]')!.textContent).toContain('2 prêteurs')
    expect(caseDe(host, 7).disabled).toBe(false)
    expect(caseDe(host, 8).disabled).toBe(true)
    expect(host.querySelector('[data-test=lend-note-8]')!.textContent).toContain('Un admin de l\'org peut la passer en pool')
    expect(host.querySelector<HTMLButtonElement>('[data-test=lend-save]')!.disabled).toBe(true)
    unmount()
  })

  it('enregistrer envoie l’ensemble COMPLET lent_to, et la réponse relue fait foi', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [{ ...CONNECTE, lent_to: [7] }] })
    api.setModelSubscriptionLending.mockResolvedValue({ ...CONNECTE, lent_to: [7, 9] })
    mesOrgs()
    const { host, unmount } = await mountView()
    expect(caseDe(host, 7).checked).toBe(true)
    await cocher(host, 9, true)
    expect(host.querySelector<HTMLButtonElement>('[data-test=lend-save]')!.disabled).toBe(false)
    await soumettre(host)
    expect(api.setModelSubscriptionLending).toHaveBeenCalledWith('claude_subscription', [7, 9])
    expect(caseDe(host, 9).checked).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[data-test=lend-save]')!.disabled).toBe(true)
    unmount()
  })

  it('retirer un prêt dans une org repassée en personnel reste possible ; tout retirer envoie []', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [{ ...CONNECTE, lent_to: [8] }] })
    api.setModelSubscriptionLending.mockResolvedValue({ ...CONNECTE, lent_to: [] })
    mesOrgs()
    const { host, unmount } = await mountView()
    expect(caseDe(host, 8).disabled).toBe(false)
    expect(host.querySelector('[data-test=lend-note-8]')!.textContent).toContain('ton prêt ne sert pas')
    await cocher(host, 8, false)
    await soumettre(host)
    expect(api.setModelSubscriptionLending).toHaveBeenCalledWith('claude_subscription', [])
    expect(caseDe(host, 8).disabled).toBe(true)   // plus prêté, et toujours hors pool
    unmount()
  })

  it('un refus est nommé sous les cases ; le brouillon reste', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [{ ...CONNECTE, lent_to: [] }] })
    api.setModelSubscriptionLending.mockRejectedValue(new ApiError(403, 'subscription_not_enabled'))
    mesOrgs()
    const { host, unmount } = await mountView()
    await cocher(host, 7, true)
    await soumettre(host)
    expect(host.querySelector('[data-test=lend-error]')!.textContent).toContain("n'est pas ouverte sur ton compte")
    expect(caseDe(host, 7).checked).toBe(true)
    expect(host.querySelector('[data-test=not-enabled]')).toBeNull()   // le parcours n'est pas touché

    api.setModelSubscriptionLending.mockRejectedValue(new ApiError(403, 'not_org_member'))
    await soumettre(host)
    expect(host.querySelector('[data-test=lend-error]')!.textContent).toContain("n'es plus membre")
    unmount()
  })

  it('abonnement non connecté : le dire ; sans abonnement, aucune carte de prêt ni lecture des orgs', async () => {
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [{ ...CONNECTE, statut: 'needs_login', lent_to: [] }] })
    mesOrgs()
    const a = await mountView()
    expect(a.host.querySelector('[data-test=lend-not-connected]')).not.toBeNull()
    a.unmount()

    vi.clearAllMocks()
    api.getModelSubscriptions.mockResolvedValue({ subscriptions: [] })
    const b = await mountView()
    expect(b.host.querySelector('[data-test=lend-card]')).toBeNull()
    expect(api.getMyOrgs).not.toHaveBeenCalled()
    b.unmount()
  })
})
