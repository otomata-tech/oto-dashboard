// Lecture de `GET /api/me/agent-toolbox` (oto#166) : ce que l'agent voit VRAIMENT.
//
// Deux pièges, énoncés par le schéma lui-même :
//  • `available: false` = la vue n'a pas pu être dérivée — jamais « aucun outil ».
//    Tout compteur rend alors `null` (rien à afficher), jamais 0.
//  • `tools_total` = outils MONTÉS sur l'instance, visibles ou non. Ce que l'agent
//    voit, ce sont les noms de `tools` — ceux de la poignée de main.
import type { AgentToolbox } from '@/types/api'

export interface SeenCounts {
  connectors: number   // connecteurs dont l'agent voit au moins un outil
  tools: number        // outils visibles, connecteur ou non
}

export function seenCounts(tb: AgentToolbox | null | undefined): SeenCounts | null {
  if (!tb?.available || !tb.connectors || !tb.tools) return null
  return { connectors: tb.connectors.length, tools: tb.tools.length }
}
