import * as Sentry from '@sentry/vue'
import type { App } from 'vue'

// Error tracking front (Sentry, projet `oto-dashboard`, région EU). Optionnel par
// design : sans VITE_SENTRY_DSN le module est un no-op complet (dev local, env non
// configurée) — pas un fallback silencieux, juste une intégration opt-in par env.
//
// Distinct de l'analytics PostHog (lib/analytics) : Sentry = défauts JS / crashes,
// PostHog = produit + session replay. On ne double PAS le replay ici (PostHog le
// fait déjà, gaté par consentement) et on ne fait pas de tracing perf.
//
// RGPD : error tracking sans PII = intérêt légitime (débogage), donc PAS gaté
// derrière le consentement analytics — mais `sendDefaultPii: false` (pas d'IP),
// et le dashboard masque déjà les inputs sensibles côté replay. On capture le
// `sub` Logto (id opaque) en contexte user pour corréler.
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

export function initSentry(app: App): void {
  if (!DSN) return
  Sentry.init({
    app,
    dsn: DSN,
    environment: (import.meta.env.VITE_SENTRY_ENV as string) || 'production',
    // Intégrations par défaut (handlers d'erreurs globaux + erreurs de composant
    // Vue via `app`). Pas de browserTracing ni de replay (non-défaut en v10).
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}

// Relie l'utilisateur identifié (post-login) à ses events Sentry — `sub` Logto
// seulement (id opaque pseudonyme). Appelé au même endroit qu'identifyUser.
export function setSentryUser(sub: string | null): void {
  if (!DSN) return
  Sentry.setUser(sub ? { id: sub } : null)
}
