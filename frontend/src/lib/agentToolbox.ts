// Lecture de `GET /api/me/agent-toolbox` (oto#166) : ce que l'agent voit VRAIMENT.
//
// Deux pièges, énoncés par le schéma lui-même :
//  • `available: false` = la vue n'a pas pu être dérivée — jamais « aucun outil ».
//    Tout compteur rend alors `null` (rien à afficher), jamais 0.
//  • `tools_total` = outils MONTÉS sur l'instance, visibles ou non. Ce que l'agent
//    voit, ce sont les noms de `tools` — ceux de la poignée de main.
import type { AgentToolbox, InstalledNotSeen, ToolEntry } from '@/types/api'

export interface SeenCounts {
  connectors: number   // connecteurs dont l'agent voit au moins un outil
  tools: number        // outils visibles, connecteur ou non
}

export function seenCounts(tb: AgentToolbox | null | undefined): SeenCounts | null {
  if (!tb?.available || !tb.connectors || !tb.tools) return null
  return { connectors: tb.connectors.length, tools: tb.tools.length }
}

// « Ce qu'il peut faire » (page contexte) : les outils que l'agent VOIT, groupés par
// préfixe — plus ceux que la personne a masqués elle-même, qu'elle doit pouvoir rendre.
// Les autres outils du catalogue ne sont PAS listés : leur connecteur n'est pas installé,
// est en veille, coupé ou réservé, et aucun bouton de cette page ne les ferait voir.
// `null` ⇔ vue non dérivable : la liste n'est pas rendue (jamais « 0 visibles »).
export interface ToolLine { name: string; visible: boolean; protected: boolean; description?: string }
export interface ToolGroup { namespace: string; tools: ToolLine[]; visible: number }
export interface ToolsSeenView { visible: number; maskedByYou: number; groups: ToolGroup[] }

const prefixe = (name: string) => name.split('_', 1)[0] ?? name

export function toolsSeenView(
  tb: AgentToolbox | null | undefined, prefs: ToolEntry[],
): ToolsSeenView | null {
  if (!tb?.available || !tb.tools) return null
  const vus = new Set(tb.tools)
  const pref = new Map(prefs.map((p) => [p.name, p]))
  const lignes: ToolLine[] = [
    ...tb.tools.map((name) => ({
      name, visible: true, protected: !!pref.get(name)?.protected, description: pref.get(name)?.description,
    })),
    ...prefs.filter((p) => !p.enabled && !vus.has(p.name))
      .map((p) => ({ name: p.name, visible: false, protected: false, description: p.description })),
  ]
  const par: Record<string, ToolLine[]> = {}
  for (const l of lignes) (par[prefixe(l.name)] ??= []).push(l)
  const groups = Object.entries(par)
    .map(([namespace, tools]) => ({
      namespace,
      tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
      visible: tools.filter((t) => t.visible).length,
    }))
    .sort((a, b) => Number(b.visible > 0) - Number(a.visible > 0) || a.namespace.localeCompare(b.namespace))
  return { visible: vus.size, maskedByYou: lignes.length - tb.tools.length, groups }
}

// « Installé, mais ton agent ne le voit pas » (mes connecteurs) : la raison servie par
// `installed_not_seen[].reason`, dite en clair — `list` pour la ligne, `phrase` pour la
// fiche. `paused` rend `null` : le verdict de la ligne dit déjà « En veille — outils
// masqués de tes agents », le redire serait du bruit. En solo (org personnelle) on ne
// prononce pas « organisation » (principe 9 du CDC connecteurs).
export interface UnseenWhy { list: string; phrase: string }

export function unseenReason(
  reason: InstalledNotSeen['reason'], opts: { isPersonal?: boolean } = {},
): UnseenWhy | null {
  switch (reason) {
    case 'paused':
      return null
    case 'cut': {
      // `cut` = l'org (ou la plateforme) l'a coupé ; il revient seul à la réouverture.
      const list = opts.isPersonal ? 'coupé' : 'coupé pour ton organisation'
      return { list, phrase: `${list} ; il reviendra seul à sa réouverture` }
    }
    case 'restricted':
      // Reprise du verdict « Réservé » (lib/connectorVerdict.ts).
      return { list: 'réservé à certaines équipes', phrase: 'réservé à certaines équipes — demande à un admin' }
    case 'no_tools':
      return { list: 'aucun outil chargé', phrase: "aucun de ses outils n'est chargé pour l'instant" }
  }
}

// Les installés invisibles, par nom de connecteur. Vue non dérivable ⇒ carte VIDE : on
// ne dit alors d'aucun connecteur qu'il est invisible.
export function notSeenByName(tb: AgentToolbox | null | undefined): Map<string, InstalledNotSeen> {
  if (!tb?.available || !tb.installed_not_seen) return new Map()
  return new Map(tb.installed_not_seen.map((x) => [x.name, x]))
}
