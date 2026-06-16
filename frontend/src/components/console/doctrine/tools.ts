// Résolution des références d'outils d'une doctrine (ADR 0014).
// Un marqueur `<tool:slug>` dans le content est résolu contre le registre
// (/api/me/tools/registry) : présent → natif/fédéré, absent → drift signalé.
import type { ToolRegistryEntry } from '@/types/api'

export type ToolReg = Map<string, ToolRegistryEntry>

export type ToolState = 'ok' | 'fed' | 'dead'

export interface Resolved {
  state: ToolState
  desc: string
  mcp?: string
  srcLabel: string
}

export function buildReg(tools: ToolRegistryEntry[]): ToolReg {
  return new Map(tools.map((t) => [t.name, t]))
}

export function resolveTool(reg: ToolReg, name: string): Resolved {
  const t = reg.get(name)
  if (!t) {
    return {
      state: 'dead',
      desc: "introuvable dans le registre — renommé ou supprimé ? l'appel échouera.",
      srcLabel: 'non résolu',
    }
  }
  if (t.source === 'federated') {
    return { state: 'fed', desc: t.description, mcp: t.mcp, srcLabel: `fédéré · ${t.mcp ?? ''}` }
  }
  return { state: 'ok', desc: t.description, srcLabel: 'natif oto' }
}

const MARKER = /<tool:([a-z0-9_]+)>/g

// Noms d'outils cités dans un texte, dédupliqués, dans l'ordre d'apparition.
export function refNames(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  MARKER.lastIndex = 0
  while ((m = MARKER.exec(text || ''))) {
    const name = m[1]
    if (name && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

export function hasDead(reg: ToolReg, text: string): boolean {
  return refNames(text).some((n) => !reg.has(n))
}
