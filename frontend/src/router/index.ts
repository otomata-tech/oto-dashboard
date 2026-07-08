import { createRouter, createWebHistory, type RouteRecordRaw, type RouteMeta } from 'vue-router'
import ConsoleLayout from '../views/console/ConsoleLayout.vue'
import InviteAcceptView from '../views/InviteAcceptView.vue'
import ImportProjectView from '../views/ImportProjectView.vue'
import { NAV, type NavLevel } from '@/lib/consoleNav'
import {
  currentViewOrg, setViewOrgId, currentViewGroup, setViewGroupId, consultRedirectPath,
} from '@/lib/viewOrg'

// URL par org & équipe (ADR 0023, 2026-07-06) : l'org ET l'équipe de CONSULTATION
// vivent dans le chemin, préfixe `/o/:orgId[/g/:groupId]/…`. Chaque org (et chaque
// équipe) a donc son URL (bookmarkable, deux onglets = deux contextes, plus besoin de
// « switcher »). Une URL SANS préfixe = la maison (le backend la rend quand ni
// `X-Oto-Org` ni `X-Oto-Group` ne sont présents) ; `ConsoleLayout` la canonicalise
// ensuite vers `/o/<maison>[/g/<équipe maison>]/…`.
//
// Sont org-scopés les niveaux work/group/org (leurs vues dépendent de l'org vue) ;
// PAS la plateforme (cross-org) ni /account /activity (niveau user). Chaque section
// org-scopée est enregistrée en TROIS formes : nue (deep-links legacy + 1er load),
// préfixée org, préfixée org+équipe. Une garde `beforeEach` réécrit tout lien nu
// org-scopé vers `/o/<org>[/g/<équipe>]/…` (contexte courant) → les
// `router.push('/connectors')` et `<RouterLink>` nus du code restent inchangés.

const ORG_SCOPED: ReadonlySet<NavLevel> = new Set<NavLevel>(['work', 'group', 'org'])

// section canonique d'un chemin de détail (`/projects/:id` → `/projects`).
function sectionOf(path: string): string {
  return path.replace(/\/:[^/]+.*$/, '')
}

// Les deux formes préfixées d'un chemin org-scopé : org seule, org + équipe.
function scopedVariants(path: string, meta: RouteMeta): RouteRecordRaw[] {
  return [
    { path: `/o/:orgId(\\d+)${path}`, component: ConsoleLayout, meta },
    { path: `/o/:orgId(\\d+)/g/:groupId(\\d+)${path}`, component: ConsoleLayout, meta },
  ]
}

// Une route par section, dérivée de NAV. `meta.section` = path canonique (clé vue +
// surlignage), `meta.level` pilote le switch de niveau, `meta.orgScoped` la garde.
const sectionRoutes: RouteRecordRaw[] = NAV.flatMap((g) =>
  g.items.flatMap((it) => {
    const orgScoped = ORG_SCOPED.has(g.level)
    const meta = { section: it.path, level: g.level, orgScoped }
    const routes: RouteRecordRaw[] = [{ path: it.path, component: ConsoleLayout, meta }]
    if (orgScoped) routes.push(...scopedVariants(it.path, meta))
    return routes
  }),
)

// Route de détail org-scopée (work) : nue + préfixées, portée par `meta.detail` (et non
// le nom, pour éviter la collision de noms entre les enregistrements).
function detailRoutes(path: string, detail: string): RouteRecordRaw[] {
  const meta = { section: sectionOf(path), level: 'work' as NavLevel, orgScoped: true, detail }
  return [
    { path, component: ConsoleLayout, meta },
    ...scopedVariants(path, meta),
  ]
}

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
    // « gérer mon groupe » (/group, ex mono-item niveau group) → scope team dédié, atterrit
    // sur /team/context. Nue + préfixées (la garde beforeEach re-préfixe la nue au besoin).
    { path: '/group', redirect: '/team/context' },
    { path: '/o/:orgId(\\d+)/group', redirect: (to) => `/o/${to.params.orgId}/team/context` },
    { path: '/o/:orgId(\\d+)/g/:groupId(\\d+)/group', redirect: (to) => `/o/${to.params.orgId}/g/${to.params.groupId}/team/context` },
    // « départements » → « teams » (renommage vocabulaire produit 2026-07-06). Le roster
    // vit en /org/teams ; l'ancien deep-link `?dept=<id>` n'est plus consommé (on retombe
    // sur la liste). Nue + préfixées pour les bookmarks legacy.
    { path: '/org/departments', redirect: '/org/teams' },
    { path: '/o/:orgId(\\d+)/org/departments', redirect: (to) => `/o/${to.params.orgId}/org/teams` },
    { path: '/o/:orgId(\\d+)/g/:groupId(\\d+)/org/departments', redirect: (to) => `/o/${to.params.orgId}/g/${to.params.groupId}/org/teams` },
    // Acceptation d'invitation (hors shell console) — gère sa propre auth.
    // /invite?token= = lien mail legacy ; /invitation/<carrier>[/<code>] = lien
    // partageable (referral réutilisable si carrier seul, nominatif si +code).
    { path: '/invite', name: 'invite', component: InviteAcceptView },
    { path: '/invitation/:carrier/:code?', name: 'invitation', component: InviteAcceptView },
    // « Ajouter à mon Oto » depuis un partage public (`<slug>.share.oto.cx`) — forke le
    // projet publié dans l'org active puis l'ouvre. Hors shell console (gère sa propre auth).
    { path: '/import', name: 'import-project', component: ImportProjectView },
    // NB : les partages publics de projet/doc ne sont PLUS des routes SPA — le partage
    // navigable d'un projet est rendu SERVER-SIDE sur `<slug>.share.oto.cx` (share_ui),
    // et `/p/d/<token>` (doc public) est rendu server-side par le backend via Caddy.
    {
      // Fiche user (admin) — niveau plateforme (cross-org), donc NON préfixée par org.
      // Résolue par le layout vers AdminUserView (via meta.detail).
      path: '/platform/users/:sub',
      component: ConsoleLayout,
      meta: { section: '/platform/users', level: 'platform', orgScoped: false, detail: 'admin-user' },
    },
    {
      // Fiche org (admin) — niveau plateforme (cross-org), NON préfixée par org.
      // Résolue par le layout vers AdminOrgView (via meta.detail).
      path: '/platform/orgs/:id(\\d+)',
      component: ConsoleLayout,
      meta: { section: '/platform/orgs', level: 'platform', orgScoped: false, detail: 'admin-org' },
    },
    // Détails org-scopés (nus + préfixés `/o/:orgId/…`), portés par meta.detail.
    ...detailRoutes('/projects/:id', 'project'),
    // Un tableau lié ouvert DANS la page projet (`ProjectDetailView` lit `:nsRef`) —
    // même `detail='project'` → ProjectDetailView reste monté (viewKey keyé sur :id).
    ...detailRoutes('/projects/:id/data/:nsRef', 'project'),
    ...detailRoutes('/data/:id', 'data'),
    ...detailRoutes('/procedures/:id', 'procedure'),
    // Équipe ouverte (ex `/org/teams/:teamId`, blocs empilés) → DESCENTE dans le scope
    // team dédié `/o/:org/g/:teamId/team/context`. Préfixées : on connaît l'org → on
    // construit le préfixe `/g/`. Nue (sans org) : on retombe sur la liste (la garde
    // re-préfixe /org/teams vers l'org courante).
    { path: '/o/:orgId(\\d+)/org/teams/:teamId(\\d+)', redirect: (to) => `/o/${to.params.orgId}/g/${to.params.teamId}/team/context` },
    { path: '/o/:orgId(\\d+)/g/:groupId(\\d+)/org/teams/:teamId(\\d+)', redirect: (to) => `/o/${to.params.orgId}/g/${to.params.teamId}/team/context` },
    { path: '/org/teams/:teamId(\\d+)', redirect: '/org/teams' },
    {
      // /account (« manage account ») et /activity : niveau user, NON org-scopés.
      path: '/account',
      component: ConsoleLayout,
      meta: { section: '/account', level: 'work', orgScoped: false },
    },
    {
      path: '/activity',
      component: ConsoleLayout,
      meta: { section: '/activity', level: 'work', orgScoped: false },
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

// Garde : un lien org-scopé NU (sans préfixe `/o/:orgId`) hérite du contexte de l'URL
// D'OÙ L'ON PART (`from.params`) — pas d'un état module mutable, qui se perd dès qu'on
// visite une page non-org. Ainsi un `router.push('/connectors')` ou un lien nu cliqué
// depuis `/o/81/…` reste dans l'org 81. Repli sur `currentViewOrg()` (seed URL au boot)
// quand `from` n'a pas encore de contexte (navigation programmatique initiale). Contexte
// inconnu ⇒ on laisse passer la version nue (le backend rend la maison).
router.beforeEach((to, from) => {
  const curOrg = (typeof from.params.orgId === 'string' ? from.params.orgId : null) ?? currentViewOrg()
  const curGroup = (typeof from.params.groupId === 'string' ? from.params.groupId : null) ?? currentViewGroup()
  const redirect = consultRedirectPath(
    to.path, Boolean(to.meta.orgScoped), to.params.orgId != null, curOrg, curGroup,
  )
  return redirect ? { path: redirect, query: to.query, hash: to.hash } : true
})

// Synchronise l'org ET l'équipe de consultation (→ `viewHeaders`) sur l'URL résolue.
// L'URL est la source de vérité : changer d'org (sans `/g/`) laisse naturellement
// tomber l'équipe (invariant ADR 0023 — une équipe appartient à une org).
router.afterEach((to) => {
  setViewOrgId(typeof to.params.orgId === 'string' ? to.params.orgId : null)
  setViewGroupId(typeof to.params.groupId === 'string' ? to.params.groupId : null)
})

export default router
