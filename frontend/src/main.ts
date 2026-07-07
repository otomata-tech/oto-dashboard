import './assets/main.css'
import './assets/console.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { i18n } from './lib/i18n'
import { useAuth } from './composables/useAuth'
import { initAnalytics, capturePageview } from './lib/analytics'
import { initSentry } from './lib/sentry'

// Analytics + session replay (PostHog Cloud EU) — no-op si VITE_POSTHOG_KEY absent.
initAnalytics()
// Chunk périmé après un redeploy (import dynamique / CSS d'une route qui n'existe
// plus sous ce hash) : recharger prend la nouvelle version au lieu de casser la nav.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  window.location.reload()
})
// Pageviews SPA (couvre le 1er rendu et chaque navigation).
router.afterEach(() => capturePageview())

// initAuth AVANT le mount : traite le retour PKCE /callback et résout
// l'état de session une seule fois, le router démarre ensuite.
// (IIFE plutôt que top-level await : indépendant du target de build.)
void (async () => {
  const { initAuth } = useAuth()
  await initAuth()

  const app = createApp(App)
  // Error tracking front (Sentry) — no-op si VITE_SENTRY_DSN absent. Tôt, pour
  // capturer aussi les erreurs au montage.
  initSentry(app)
  app.use(i18n)
  app.use(router)
  app.mount('#app')
})()
