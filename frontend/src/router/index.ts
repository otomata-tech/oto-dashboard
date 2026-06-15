import { createRouter, createWebHistory } from 'vue-router'
import ConsoleLayout from '../views/console/ConsoleLayout.vue'
import InviteAcceptView from '../views/InviteAcceptView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/console/overview' },
    { path: '/console', redirect: '/console/overview' },
    // Acceptation d'invitation (hors shell console) — gère sa propre auth.
    { path: '/invite', name: 'invite', component: InviteAcceptView },
    {
      // Une seule route dynamique : le layout résout la section → vue.
      path: '/console/:section',
      name: 'console',
      component: ConsoleLayout,
    },
    {
      // Le retour PKCE est traité par initAuth() avant le mount du router
      // (cf. useAuth) ; on renvoie ensuite vers la console.
      path: '/callback',
      redirect: '/console/overview',
    },
  ],
})

export default router
