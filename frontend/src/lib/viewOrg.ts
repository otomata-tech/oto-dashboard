// Consultation (view-as, ADR 0023) — état front qui décide QUELS headers de scope
// (`X-Oto-Org` / `X-Oto-Group` / `X-Oto-View-As`) partent au backend. Le backend
// scope ses lectures/écritures dessus SANS rien persister ni toucher l'identité MCP
// (maison / session).
//
// ⚠️ Depuis 2026-07-06 l'org ET l'équipe de consultation vivent dans l'URL, plus en
// localStorage : préfixe `/o/:orgId[/g/:groupId]/…`. Chaque org (et chaque équipe) a
// donc son URL (bookmarkable, deux onglets = deux contextes). Le routeur synchronise
// ces variables module (`setViewOrgId`/`setViewGroupId` en afterEach) ; `viewHeaders()`
// les lit. Absentes = on voit la maison (ni `X-Oto-Org` ni `X-Oto-Group`).
// Le view-as USER reste en localStorage (axe orthogonal, opérateur plateforme).
const USER_KEY = 'oto_view_user'

// ── org / équipe de consultation : dérivées de l'URL, tenues en variables module ──
// Préfixe canonique : `/o/<org>[/g/<group>]/…` (ids = entiers positifs).
export function parseOrgFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/o\/(\d+)(?:\/|$)/)
  return m ? m[1]! : null
}
export function parseGroupFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/o\/\d+\/g\/(\d+)(?:\/|$)/)
  return m ? m[1]! : null
}

// Seed synchrone à l'import : garantit des headers corrects dès le 1er appel `api()`
// (avant même le 1er afterEach du routeur). SSR-safe (garde `window`).
let viewOrgId: string | null =
  typeof window !== 'undefined' ? parseOrgFromPath(window.location.pathname) : null
let viewGroupId: string | null =
  typeof window !== 'undefined' ? parseGroupFromPath(window.location.pathname) : null

export function currentViewOrg(): string | null { return viewOrgId }
export function currentViewGroup(): string | null { return viewGroupId }
// Appelés par le routeur (afterEach) à chaque navigation résolue.
export function setViewOrgId(value: string | null): void { viewOrgId = value }
export function setViewGroupId(value: string | null): void { viewGroupId = value }

// Décision de la garde routeur (beforeEach) : un chemin org-scopé NU (sans préfixe
// `/o/:orgId`) hérite du contexte courant (org + équipe). Retourne le chemin préfixé à
// rediriger, ou null (laisser passer : non org-scopé, déjà préfixé, ou contexte inconnu
// au 1er chargement — canonicalisé ensuite par ConsoleLayout).
// Préfixe un chemin canonique par le contexte org/équipe (`/o/<org>[/g/<group>]/…`).
// `orgId == null` ⇒ chemin nu (la maison). Source unique du préfixe : consommé par la
// garde routeur ET par `useScopedLink` (génération de liens déterministe).
export function scopedPath(path: string, orgId: string | null, groupId: string | null): string {
  if (!orgId) return path
  return `/o/${orgId}${groupId ? `/g/${groupId}` : ''}${path}`
}

export function consultRedirectPath(
  path: string, orgScoped: boolean, hasOrgParam: boolean,
  curOrg: string | null, curGroup: string | null,
): string | null {
  if (!orgScoped || hasOrgParam || curOrg == null) return null
  return scopedPath(path, curOrg, curGroup)
}

// « Voir en tant que » (ADR 0023, axe USER, LECTURE SEULE) — opérateur plateforme
// uniquement, gaté backend. On stocke {sub, name} pour le bandeau. Envoyé en header
// `X-Oto-View-As` ; le backend résout alors le dashboard sur ce user (et son org maison).
export interface ViewUser { sub: string; name: string }
export function getViewUser(): ViewUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as ViewUser } catch { return null }
}
export function setViewUser(u: ViewUser | null): void {
  if (u === null) { localStorage.removeItem(USER_KEY); return }
  localStorage.setItem(USER_KEY, JSON.stringify(u))
}

export function viewHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const u = getViewUser()
  if (u) { h['X-Oto-View-As'] = u.sub; return h }  // user-as prime : sa maison suit, pas de view-org
  if (viewOrgId !== null) h['X-Oto-Org'] = viewOrgId
  if (viewGroupId !== null) h['X-Oto-Group'] = viewGroupId
  return h
}
