import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// oto-dashboard#132 — reopenConsent() existait mais n'était branché à aucun bouton :
// le retrait de consentement analytics n'avait donc jamais d'effet réel. Ce spec fige
// le comportement attendu (RGPD art. 7 §3) : couper PostHog, purger son stockage local,
// et effacer notre propre décision pour que le bandeau se rouvre — sans rechargement.
const posthogMock = {
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
}
vi.mock('posthog-js', () => ({ default: posthogMock }))

const CONSENT_KEY = 'oto-analytics-consent'

describe('analytics — retrait de consentement (reopenConsent)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubEnv('VITE_POSTHOG_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('coupe la capture, purge le stockage PostHog et rouvre le bandeau', async () => {
    const analytics = await import('./analytics')
    analytics.initAnalytics()
    analytics.grantConsent()
    expect(analytics.consent.value).toBe('granted')
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted')

    analytics.reopenConsent()

    expect(posthogMock.opt_out_capturing).toHaveBeenCalled()
    expect(posthogMock.stopSessionRecording).toHaveBeenCalled()
    // purge réelle du stockage local du SDK (distinct_id, cookies/localStorage) —
    // pas juste un opt-out visuel
    expect(posthogMock.reset).toHaveBeenCalledWith(true)
    // notre propre décision est effacée → ConsentBanner (show = enabled && consent
    // === null) se rouvre, sans rechargement de page
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull()
    expect(analytics.consent.value).toBeNull()
  })

  it('ne casse rien si PostHog n\'a jamais été initialisé (pas de clé)', async () => {
    vi.unstubAllEnvs() // pas de VITE_POSTHOG_KEY → module no-op
    const analytics = await import('./analytics')
    analytics.grantConsent()

    expect(() => analytics.reopenConsent()).not.toThrow()
    expect(posthogMock.reset).not.toHaveBeenCalled()
    expect(analytics.consent.value).toBeNull()
  })
})
