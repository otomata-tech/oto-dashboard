import { createRouter, createWebHistory, type RouteRecordRaw, type RouteMeta } from 'vue-router'
import ConsoleLayout from '../views/console/ConsoleLayout.vue'
import InviteAcceptView from '../views/InviteAcceptView.vue'
import { NAV, type NavLevel } from '@/lib/consoleNav'
import { sectionHorsVue } from '@/lib/vueBornee'
import { ANCIENNES_LISTES, detailEspace, PAGES_ESPACE, SECTION as SECTION_AUTOMATIONS } from '@/lib/automationsEspace'
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
// Sont org-scopés les niveaux work/org (leurs vues dépendent de l'org vue) ;
// PAS la plateforme (cross-org) ni /account (niveau user). Chaque section
// org-scopée est enregistrée en TROIS formes : nue (deep-links legacy + 1er load),
// préfixée org, préfixée org+équipe. Une garde `beforeEach` réécrit tout lien nu
// org-scopé vers `/o/<org>[/g/<équipe>]/…` (contexte courant) → les
// `router.push('/connectors')` et `<RouterLink>` nus du code restent inchangés.

const ORG_SCOPED: ReadonlySet<NavLevel> = new Set<NavLevel>(['work', 'org'])

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

// Route de détail org-scopée : nue + préfixées, portée par `meta.detail` (et non le nom,
// pour éviter la collision de noms entre les enregistrements). `section` se déduit du
// chemin (`/projects/:id` → `/projects`) ; une page sans paramètre la déclare. `level`
// pilote le switch de niveau de nav (`work` par défaut — `/org/teams/:id` est `org`).
function detailRoutes(
  path: string, detail: string, section = sectionOf(path), level: NavLevel = 'work',
): RouteRecordRaw[] {
  const meta = { section, level, orgScoped: true, detail }
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
    // Ancienne adresse de la zone Documents (réunion 30/06). Elle a été distribuée :
    // elle continue de résoudre, même si le vocabulaire qu'elle porte a disparu des
    // écrans. Ne pas la retirer — `vocabulaire.tripwire.spec.ts` la protège.
    { path: '/knowledge', redirect: '/documents' },
    { path: '/toolbox', redirect: '/connectors' },
    // Bibliothèques fusionnées en onglet « marketplace » des pages connecteurs /
    // procédures (point d'entrée unique) : l'ex-groupe nav « library » a disparu.
    { path: '/library/connectors', redirect: '/connectors?tab=marketplace' },
    // La bibliothèque de procédures a quitté le dashboard (oto#192) : l'adresse retombe sur la liste.
    { path: '/library/doctrines', redirect: '/procedures' },
    // « doctrine » → « procédures » (unbundle 2026-07 : la doctrine de base est devenue
    // l'agent readme, éditée sur /org et /account ; l'écran ne porte que les procédures).
    { path: '/doctrine', redirect: (to) => ({ path: '/procedures', query: to.query }) },
    { path: '/doctrine/:id', redirect: (to) => `/procedures/${to.params.id}` },
    // Redaction de champs migrée dans la carte connecteur (onglet transformations).
    { path: '/org/redaction', redirect: '/connectors' },
    // Clés plateforme fusionnées dans le cockpit connecteurs plateforme (ADR 0022).
    { path: '/platform/keys', redirect: '/platform/connectors' },
    // Instructions serveur absorbées par le context plateforme (bascule B5, 2026-07-23).
    { path: '/platform/instructions', redirect: '/platform/context' },
    // Usage & déroulés fusionnés dans la supervision (onglet « signaux d'usage »).
    { path: '/platform/usage', redirect: '/platform/monitoring?tab=usage' },
    // « départements » → « teams » (renommage vocabulaire produit 2026-07-06). Le roster
    // vit en /org/teams ; l'ancien deep-link `?dept=<id>` n'est plus consommé (on retombe
    // sur la liste). Nue + préfixées pour les bookmarks legacy.
    { path: '/org/departments', redirect: '/org/teams' },
    { path: '/o/:orgId(\\d+)/org/departments', redirect: (to) => `/o/${to.params.orgId}/org/teams` },
    { path: '/o/:orgId(\\d+)/g/:groupId(\\d+)/org/departments', redirect: (to) => `/o/${to.params.orgId}/g/${to.params.groupId}/org/teams` },
    // Acceptation d'invitation d'org (hors shell console) — gère sa propre auth.
    // /invitation/<token> = le lien envoyé par le backend ; /invite?token= = ancien lien mail.
    { path: '/invite', name: 'invite', component: InviteAcceptView },
    { path: '/invitation/:token', name: 'invitation', component: InviteAcceptView },
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
      // Fiche org (admin) — vraie sous-page (AdminOrgView via meta.detail, même patron
      // que la fiche user ; fin du master-détail empilé, refonte /platform 2026-07-23).
      path: '/platform/orgs/:id(\\d+)',
      component: ConsoleLayout,
      meta: { section: '/platform/orgs', level: 'platform', orgScoped: false, detail: 'admin-org' },
    },
    // Détails org-scopés (nus + préfixés `/o/:orgId/…`), portés par meta.detail.
    // Recherche transverse (lot 3 Ship 2) : page d'exploration deep-linkable (?q=).
    { path: '/search', component: ConsoleLayout, meta: { section: '/search', level: 'work', orgScoped: true } },
    ...scopedVariants('/search', { section: '/search', level: 'work', orgScoped: true }),
    ...detailRoutes('/projects/:id', 'project'),
    // Un tableau lié ouvert DANS la page projet (`ProjectDetailView` lit `:nsRef`) —
    // même `detail='project'` → ProjectDetailView reste monté (viewKey keyé sur :id).
    ...detailRoutes('/projects/:id/data/:nsRef', 'project'),
    ...detailRoutes('/data/:id', 'data'),
    // Deep-link d'une ROW (`…/item/<rowId>`) : l'URL porte la fiche ouverte dans le
    // drawer (DatastoreTable lit `:rowId`) — partageable, survit au refresh.
    ...detailRoutes('/data/:id/item/:rowId', 'data'),
    ...detailRoutes('/projects/:id/data/:nsRef/item/:rowId', 'project'),
    ...detailRoutes('/procedures/:id', 'procedure'),
    // L'espace Automatisations (oto#214) : des pages plates de section `/automations`, que la
    // vue d'espace choisit par `meta.detail`. `:id` n'est pas contraint : une adresse sans
    // identifiant se DIT, au lieu de retomber en silence sur l'aperçu.
    ...PAGES_ESPACE.flatMap((p) => detailRoutes(p.path, detailEspace(p.page), SECTION_AUTOMATIONS)),
    // Les anciennes listes (campagnes, programmations) : une seule liste sur l'entrée depuis le
    // 24/09/2026. Leurs adresses publiées y mènent.
    ...ANCIENNES_LISTES.map((path) => ({ path, redirect: SECTION_AUTOMATIONS })),
    // Détail d'une équipe (membres seuls, cf. TeamDetailView) — le scope d'équipe complet
    // (contexte, connecteurs, procédures, invitation) reste hors dashboard depuis oto#192 ;
    // seule la gestion des membres est revenue (besoin réel, 18/09/2026).
    ...detailRoutes('/org/teams/:teamId(\\d+)', 'team', '/org/teams', 'team'),
    // Connecteurs d'une équipe donnée (restauré, périmètre resserré — oto#192 avait tout
    // retiré). Route de détail SŒUR de celle du dessus (même entité, sous-chemin
    // distinct) : nue + préfixée org, PAS de variante `/g/:groupId` (elle N'A PAS de sens
    // ici, la cible EST l'équipe consultée).
    {
      path: '/org/teams/:groupId(\\d+)/connectors',
      component: ConsoleLayout,
      meta: { section: '/org/teams', level: 'team' as NavLevel, orgScoped: true, detail: 'team-connectors' },
    },
    {
      path: '/o/:orgId(\\d+)/org/teams/:groupId(\\d+)/connectors',
      component: ConsoleLayout,
      meta: { section: '/org/teams', level: 'team' as NavLevel, orgScoped: true, detail: 'team-connectors' },
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

// Vue bornée d'un org_admin (oto#270) : une adresse d'écran hors de cette vue (facturation,
// jetons, admin…) retombe sur l'aperçu, comme son entrée de menu est absente.
router.beforeEach((to) => {
  const section = typeof to.meta.section === 'string' ? to.meta.section : to.path
  return sectionHorsVue(section) ? { path: '/overview' } : true
})

// Synchronise l'org ET l'équipe de consultation (→ `viewHeaders`) sur l'URL résolue.
// L'URL est la source de vérité : changer d'org (sans `/g/`) laisse naturellement
// tomber l'équipe (invariant ADR 0023 — une équipe appartient à une org).
router.afterEach((to) => {
  setViewOrgId(typeof to.params.orgId === 'string' ? to.params.orgId : null)
  setViewGroupId(typeof to.params.groupId === 'string' ? to.params.groupId : null)
})

export default router
