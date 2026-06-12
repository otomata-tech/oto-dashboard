import './assets/main.css'
import './assets/console.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'

// initAuth AVANT le mount : traite le retour PKCE /callback et résout
// l'état de session une seule fois, le router démarre ensuite.
// (IIFE plutôt que top-level await : indépendant du target de build.)
void (async () => {
  const { initAuth } = useAuth()
  await initAuth()

  const app = createApp(App)
  app.use(router)
  app.mount('#app')
})()
