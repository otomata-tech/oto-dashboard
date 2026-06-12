import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/connectors',
      name: 'connectors',
      component: () => import('../views/ConnectorsView.vue'),
    },
    {
      // Le retour PKCE est traité par initAuth() avant le mount du router
      // (cf. useAuth) ; cette route évite juste un 404 du router.
      path: '/callback',
      name: 'callback',
      component: HomeView,
    },
  ],
})

export default router
