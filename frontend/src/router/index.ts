import { createRouter, createWebHistory } from 'vue-router'
import ConsoleLayout from '../views/console/ConsoleLayout.vue'
import InviteAcceptView from '../views/InviteAcceptView.vue'
import PublicDocView from '../views/PublicDocView.vue'
import PublicProjectView from '../views/PublicProjectView.vue'
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
    // procédures (point d'entrée unique) : l'ex-groupe nav « library » a disparu.
    { path: '/library/connectors', redirect: '/connectors?tab=marketplace' },
    { path: '/library/doctrines', redirect: '/procedures?tab=marketplace' },
    // « doctrine » → « procédures » (unbundle 2026-07 : la doctrine de base est devenue
    // l'agent readme, éditée sur /org et /account ; l'écran ne porte que les procédures).
    { path: '/doctrine', redirect: (to) => ({ path: '/procedures', query: to.query }) },
    { path: '/doctrine/:id', redirect: (to) => `/procedures/${to.params.id}` },
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
    // Viewer public d'un PROJET partagé CHIFFRÉ (ADR 0032 §3) — sans auth ; la clé
    // de déchiffrement vit dans le fragment (#…), jamais envoyée au serveur.
    { path: '/p/p/:token', name: 'public-project', component: PublicProjectView },
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
      // Procédure ciblée `/procedures/:id` (id surrogate stable, ADR 0032 —
      // « stop using slug ») — section '/procedures' → DoctrineHubView (onglet mine). La
      // vue résout `:id` par id OU slug (back-compat liens/`?doc=`), normalise vers l'id.
      path: '/procedures/:id',
      name: 'procedure-detail',
      component: ConsoleLayout,
      meta: { section: '/procedures', level: 'work' },
    },
    {
      // /account (« manage account ») et /activity : retirés de la sidebar, déplacés
      // dans le menu profil du pied (ConsoleUserMenu). Routes explicites — elles ne
      // dérivent plus du groupe nav « account » (supprimé). Résolues par le layout
      // via VIEWS[section] comme n'importe quelle section.
      path: '/account',
      component: ConsoleLayout,
      meta: { section: '/account', level: 'work' },
    },
    {
      path: '/activity',
      component: ConsoleLayout,
      meta: { section: '/activity', level: 'work' },
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
