// Consultation (view-as, ADR 0023) — état front qui décide QUELS headers de scope
// (`X-Oto-Org` / `X-Oto-Group` / `X-Oto-View-As`) partent au backend. Le backend
// scope ses lectures/écritures dessus SANS rien persister ni toucher l'identité MCP
// (maison / session).
//
// ⚠️ Depuis 2026-07-06 l'org de consultation vit dans l'URL (`/o/:orgId/…`), plus en
// localStorage : chaque org a donc son URL (bookmarkable, deux onglets = deux orgs).
// Le routeur synchronise cette variable module (`setViewOrgId` en afterEach) ;
// `viewHeaders()` la lit. Absente = on voit la maison (aucun `X-Oto-Org`).
// L'ÉQUIPE (group) et le view-as USER restent en localStorage (hors périmètre v1).
const GROUP_KEY = 'oto_view_group'
const USER_KEY = 'oto_view_user'

// ── org de consultation : dérivée de l'URL, tenue en variable module ────────
// Format canonique du préfixe : `/o/<id>/…` (id = entier positif).
export function parseOrgFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/o\/(\d+)(?:\/|$)/)
  return m ? m[1]! : null
}

// Seed synchrone à l'import : garantit des headers corrects dès le 1er appel `api()`
// (avant même le 1er afterEach du routeur). SSR-safe (garde `window`).
let viewOrgId: string | null =
  typeof window !== 'undefined' ? parseOrgFromPath(window.location.pathname) : null

export function currentViewOrg(): string | null {
  return viewOrgId
}
// Appelé par le routeur (afterEach) à chaque navigation résolue.
export function setViewOrgId(value: string | null): void {
  viewOrgId = value
}

// Décision de la garde routeur (beforeEach) : un chemin org-scopé NU (sans préfixe
// `/o/:orgId`) hérite de l'org courante. Retourne le chemin préfixé à rediriger, ou
// null (laisser passer : non org-scopé, déjà préfixé, ou org courante inconnue au 1er
// chargement — canonicalisée ensuite par ConsoleLayout).
export function orgRedirectPath(
  path: string, orgScoped: boolean, hasOrgParam: boolean, current: string | null,
): string | null {
  if (!orgScoped || hasOrgParam || current == null) return null
  return `/o/${current}${path}`
}

// ── équipe consultée (localStorage) — id de groupe (">0"), null = niveau org ──
export function getViewGroup(): string | null {
  return localStorage.getItem(GROUP_KEY)
}
export function setViewGroup(value: string | null): void {
  if (value === null) localStorage.removeItem(GROUP_KEY)
  else localStorage.setItem(GROUP_KEY, value)
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
  // entrer en « voir en tant que » → repartir sur SA maison (efface l'équipe consultée).
  localStorage.removeItem(GROUP_KEY)
  localStorage.setItem(USER_KEY, JSON.stringify(u))
}

export function viewHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const u = getViewUser()
  if (u) { h['X-Oto-View-As'] = u.sub; return h }  // user-as prime : sa maison suit, pas de view-org
  if (viewOrgId !== null) h['X-Oto-Org'] = viewOrgId
  const g = getViewGroup()
  if (g !== null) h['X-Oto-Group'] = g
  return h
}
