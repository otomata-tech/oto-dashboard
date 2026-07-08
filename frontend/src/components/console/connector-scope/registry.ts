// Sélection de l'adaptateur de scope depuis le niveau de nav (route.meta.level).
// Les niveaux sont : work=user, group=team, org=org, platform=platform.
import type { NavLevel } from '@/lib/consoleNav'
import type { ConnectorScopeAdapter, ScopeCtx } from './adapter'
import { useTeamAdapter } from './useTeamAdapter'
import { usePlatformAdapter } from './usePlatformAdapter'

// Retourne `<any>` : la vue traite les lignes de façon opaque, chaque adaptateur
// porte le typage précis de SON type de ligne (évite l'invariance de R au bord vue).
export function pickAdapter(level: NavLevel, ctx: ScopeCtx): ConnectorScopeAdapter<any> {
  switch (level) {
    case 'group':
      return useTeamAdapter(ctx)
    case 'platform':
      return usePlatformAdapter(ctx)
    default:
      // Les autres scopes (user/org/platform) migrent dans les étapes suivantes.
      throw new Error(`connector-scope: adaptateur non encore migré pour le niveau « ${level} »`)
  }
}
