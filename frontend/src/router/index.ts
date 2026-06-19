import { createRouter, createWebHistory } from 'vue-router'
import ConsoleLayout from '../views/console/ConsoleLayout.vue'
import InviteAcceptView from '../views/InviteAcceptView.vue'
import { NAV } from '@/lib/consoleNav'

// Une route par section, dérivée de NAV : le `path` EST l'identité, le layout
// résout path → vue. `meta.section` = path canonique (clé vue + surlignage),
// `meta.level` pilote le switch de niveau et la sidebar.
const sectionRoutes = NAV.flatMap((g) =>
  g.items.map((it) => ({
    path: it.path,
    component: ConsoleLayout,
    meta: { section: it.path, level: g.level },
  })),
)

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/overview' },
    // Acceptation d'invitation (hors shell console) — gère sa propre auth.
    { path: '/invite', name: 'invite', component: InviteAcceptView },
    {
      // Fiche user (admin), sous /platform/users — résolue par le layout vers
      // AdminUserView ; surlignage + niveau hérités de la section users.
      path: '/platform/users/:sub',
      name: 'admin-user',
      component: ConsoleLayout,
      meta: { section: '/platform/users', level: 'platform' },
    },
    ...sectionRoutes,
    {
      // Le retour PKCE est traité par initAuth() avant le mount du router
      // (cf. useAuth) ; on renvoie ensuite vers la console.
      path: '/callback',
      redirect: '/overview',
    },
    // Tout chemin inconnu retombe sur l'overview (pas d'écran 404 dédié).
    { path: '/:pathMatch(.*)*', redirect: '/overview' },
  ],
})

export default router
