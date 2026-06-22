// Org de consultation (view-as, ADR 0023) — état PUREMENT front : quelle org le
// dashboard affiche. Envoyée au backend en header `X-Oto-Org` ; le backend scope
// ses lectures/écritures dessus SANS rien persister ni toucher l'identité MCP
// (org maison / org de session). Persistée en localStorage pour survivre au reload
// (les vues se re-scopent au reload, pattern existant). Absente = on voit la maison.
const KEY = 'oto_view_org'

// Valeur stockée : id d'org (">0"), '0' = profil perso, ou null = aucune (→ maison).
export function getViewOrg(): string | null {
  return localStorage.getItem(KEY)
}

export function setViewOrg(value: string | null): void {
  if (value === null) localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, value)
}

export function viewOrgHeader(): Record<string, string> {
  const v = getViewOrg()
  return v !== null ? { 'X-Oto-Org': v } : {}
}
