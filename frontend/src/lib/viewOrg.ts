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
import { ref } from 'vue'

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

// « Voir en tant que » (ADR 0023, axe USER) — opérateur plateforme uniquement, gaté
// backend. LECTURE SEULE par défaut. On stocke {sub, name} pour le bandeau, plus qui
// consulte (`operator`) : pendant la vue, `/api/me` rend le compte CIBLE, il ne peut
// plus dire le rôle de l'opérateur — on le fige donc à l'entrée (AdminUserView). Ce
// n'est qu'un indice d'affichage : le serveur refuse l'écriture à un non-super_admin
// (403 `view_as_write_forbidden`). Envoyé en header `X-Oto-View-As` ; le backend
// résout alors le dashboard sur ce user (et son org maison).
export interface ViewAsOperator { name: string; superAdmin: boolean }
// Vue BORNÉE d'un org_admin (oto#270) : `org` est l'org où il est admin, choisie à l'entrée
// (depuis la liste des membres). Elle ne sert qu'à POSER `X-Oto-Org` sur chaque requête — le
// serveur l'exige, `/api/me` compris (`400 view_as_org_required`), et borne tout à elle ;
// jamais d'écriture. Ce n'est PAS la vérité de la vue : « suis-je en vue bornée, sur quelle
// org, qu'est-ce qui m'y est refusé » se lit sur `/api/me` (`view_as_bound_org`,
// `view_as_refused_prefixes`), que `lib/vueBornee.ts` tient.
export interface ViewAsOrg { id: number; name: string }
export interface ViewUser { sub: string; name: string; operator?: ViewAsOperator; org?: ViewAsOrg }
export function getViewUser(): ViewUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as ViewUser } catch { return null }
}
export function setViewUser(u: ViewUser | null): void {
  // Quitter la vue ou changer de cible fait TOMBER l'acceptation d'écriture.
  if (u === null || u.sub !== writeAcceptedFor.value) writeAcceptedFor.value = null
  if (u === null) { localStorage.removeItem(USER_KEY); return }
  localStorage.setItem(USER_KEY, JSON.stringify(u))
}

// ── Écrire en tant que (décision du 24/09/2026) ───────────────────────────────
// Le super_admin peut ÉCRIRE au nom de la cible, mais seulement après un geste
// d'acceptation explicite (bandeau → confirmation). L'acceptation vaut pour UNE cible
// et vit en MÉMOIRE seulement : elle ne survit ni à un rechargement, ni à la sortie de
// la vue, ni à un changement de cible. Acceptée, chaque requête porte en plus
// `X-Oto-View-As-Write: 1` ; le serveur n'accepte une écriture en vue que sur ce
// header ET pour un super_admin, et la journalise « par <opérateur> en tant que <cible> ».
const writeAcceptedFor = ref<string | null>(null)
// Incrémenté quand une écriture a été refusée faute d'acceptation (403
// `view_as_read_only`) : le bandeau y répond en proposant le geste.
export const viewAsWriteRequests = ref(0)

export function viewAsWriteAccepted(): boolean {
  const u = getViewUser()
  return !!u && writeAcceptedFor.value === u.sub
}
export function acceptViewAsWrite(): void {
  const u = getViewUser()
  // Une vue bornée d'org_admin ne s'ouvre jamais à l'écriture (le serveur la refuse).
  writeAcceptedFor.value = u && !u.org ? u.sub : null
}
export function revokeViewAsWrite(): void { writeAcceptedFor.value = null }
export function requestViewAsWrite(): void { viewAsWriteRequests.value++ }

export function viewHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const u = getViewUser()
  if (u?.org) {  // vue bornée : toujours SON org, jamais une autre, jamais d'écriture
    h['X-Oto-View-As'] = u.sub
    h['X-Oto-Org'] = String(u.org.id)
    return h
  }
  if (u) {  // user-as prime : sa maison suit, pas de view-org
    h['X-Oto-View-As'] = u.sub
    if (writeAcceptedFor.value === u.sub) h['X-Oto-View-As-Write'] = '1'
    return h
  }
  if (viewOrgId !== null) h['X-Oto-Org'] = viewOrgId
  if (viewGroupId !== null) h['X-Oto-Group'] = viewGroupId
  return h
}
