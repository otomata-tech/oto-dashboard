// Consultation (view-as, ADR 0023) — état PUREMENT front : quelle org ET quelle
// équipe le dashboard affiche. Envoyées en headers `X-Oto-Org` / `X-Oto-Group` ;
// le backend scope ses lectures/écritures dessus SANS rien persister ni toucher
// l'identité MCP (maison / session). Persisté en localStorage (les vues se
// re-scopent au reload). Absent = on voit la maison.
const ORG_KEY = 'oto_view_org'
const GROUP_KEY = 'oto_view_group'

// Org : id (">0"), '0' = perso, null = aucune (→ maison).
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

export function viewHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const o = getViewOrg()
  if (o !== null) h['X-Oto-Org'] = o
  const g = getViewGroup()
  if (g !== null) h['X-Oto-Group'] = g
  return h
}
