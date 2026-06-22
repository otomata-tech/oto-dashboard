import './assets/main.css'
import './assets/console.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'
import { initAnalytics, capturePageview } from './lib/analytics'
import { initSentry } from './lib/sentry'

// Analytics + session replay (PostHog Cloud EU) — no-op si VITE_POSTHOG_KEY absent.
initAnalytics()
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
  app.use(router)
  app.mount('#app')
})()
