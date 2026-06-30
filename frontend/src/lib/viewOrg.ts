// Consultation (view-as, ADR 0023) — état PUREMENT front : quelle org ET quelle
// équipe le dashboard affiche. Envoyées en headers `X-Oto-Org` / `X-Oto-Group` ;
// le backend scope ses lectures/écritures dessus SANS rien persister ni toucher
// l'identité MCP (maison / session). Persisté en localStorage (les vues se
// re-scopent au reload). Absent = on voit la maison.
const ORG_KEY = 'oto_view_org'
const GROUP_KEY = 'oto_view_group'
const USER_KEY = 'oto_view_user'

// Org : id (">0") d'une org consultée ; null = aucune consultation (→ maison).
// (Plus de perso : tout user est toujours dans une org.)
export function getViewOrg(): string | null {
  return localStorage.getItem(ORG_KEY)
}
export function setViewOrg(value: string | null): void {
  if (value === null) localStorage.removeItem(ORG_KEY)
  else localStorage.setItem(ORG_KEY, value)
}

// Équipe : id de groupe (">0"), null = niveau org (pas d'équipe consultée).
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
  // entrer en « voir en tant que » → repartir sur SA maison (efface la consultation org/équipe).
  localStorage.removeItem(ORG_KEY)
  localStorage.removeItem(GROUP_KEY)
  localStorage.setItem(USER_KEY, JSON.stringify(u))
}

export function viewHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const u = getViewUser()
  if (u) { h['X-Oto-View-As'] = u.sub; return h }  // user-as prime : sa maison suit, pas de view-org
  const o = getViewOrg()
  if (o !== null) h['X-Oto-Org'] = o
  const g = getViewGroup()
  if (g !== null) h['X-Oto-Group'] = g
  return h
}
