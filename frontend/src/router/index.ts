import { createRouter, createWebHistory } from 'vue-router'
import ConsoleLayout from '../views/console/ConsoleLayout.vue'
import InviteAcceptView from '../views/InviteAcceptView.vue'
import PublicDocView from '../views/PublicDocView.vue'
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
    // Anciennes sections fusionnées dans /connectors (ex-my-connectors + ex-toolbox) :
    // redirections pour ne pas casser bookmarks / liens existants.
    { path: '/my-connectors', redirect: '/connectors' },
    // base de connaissance (Memento) → zone Documents (réunion 30/06) ; bookmark legacy.
    { path: '/knowledge', redirect: '/documents' },
    { path: '/toolbox', redirect: '/connectors' },
    // Bibliothèques fusionnées en onglet « marketplace » des pages connecteurs /
    // doctrine (point d'entrée unique) : l'ex-groupe nav « library » a disparu.
    { path: '/library/connectors', redirect: '/connectors?tab=marketplace' },
    { path: '/library/doctrines', redirect: '/doctrine?tab=marketplace' },
    // Redaction de champs migrée dans la carte connecteur (onglet transformations).
    { path: '/org/redaction', redirect: '/connectors' },
    // Clés plateforme fusionnées dans le cockpit connecteurs plateforme (ADR 0022).
    { path: '/platform/keys', redirect: '/platform/connectors' },
    // Acceptation d'invitation (hors shell console) — gère sa propre auth.
    // /invite?token= = lien mail legacy ; /invitation/<carrier>[/<code>] = lien
    // partageable (referral réutilisable si carrier seul, nominatif si +code).
    { path: '/invite', name: 'invite', component: InviteAcceptView },
    { path: '/invitation/:carrier/:code?', name: 'invitation', component: InviteAcceptView },
    // Viewer public d'un document partagé (#4a) — sans auth, hors shell console.
    { path: '/p/d/:token', name: 'public-doc', component: PublicDocView },
    {
      // Fiche user (admin), sous /platform/users — résolue par le layout vers
      // AdminUserView ; surlignage + niveau hérités de la section users.
      path: '/platform/users/:sub',
      name: 'admin-user',
      component: ConsoleLayout,
      meta: { section: '/platform/users', level: 'platform' },
    },
    {
      // Page dédiée d'un projet (objet de premier rang, ADR 0030) — résolue par le
      // layout vers ProjectDetailView ; surlignage + niveau hérités de /projects.
      path: '/projects/:id',
      name: 'project-detail',
      component: ConsoleLayout,
      meta: { section: '/projects', level: 'work' },
    },
    {
      // Tableau datastore ciblé `/data/:id` (id stable au renommage, ADR 0032) —
      // section '/data' → DataView. La vue résout `:id` par id OU nom (liens agent) et
      // absorbe l'ancien `?ns=` en le normalisant vers ce chemin.
      path: '/data/:id',
      name: 'data-detail',
      component: ConsoleLayout,
      meta: { section: '/data', level: 'work' },
    },
    {
      // Procédure/doctrine ciblée `/doctrine/:slug` (le slug EST l'identité, ADR 0032) —
      // section '/doctrine' → DoctrineHubView (onglet mine). La vue lit `:slug` et
      // absorbe l'ancien `?doc=` en le normalisant vers ce chemin.
      path: '/doctrine/:slug',
      name: 'doctrine-detail',
      component: ConsoleLayout,
      meta: { section: '/doctrine', level: 'work' },
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
