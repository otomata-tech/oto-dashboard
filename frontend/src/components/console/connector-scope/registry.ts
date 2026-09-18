// Sélection de l'adaptateur de scope depuis le niveau de nav (route.meta.level).
// Les niveaux sont : work=user, org=org, platform=platform, team=équipe (SEUL le
// panneau connecteurs a été restauré pour ce dernier — le reste du niveau équipe a
// quitté le dashboard avec oto#192 et n'y est pas revenu).
import type { NavLevel } from '@/lib/consoleNav'
import type { ConnectorScopeAdapter, ScopeCtx } from './adapter'
import { useOrgAdapter } from './useOrgAdapter'
import { usePlatformAdapter } from './usePlatformAdapter'
import { useUserAdapter } from './useUserAdapter'
import { useTeamAdapter } from './useTeamAdapter'

// Retourne `<any>` : la vue traite les lignes de façon opaque, chaque adaptateur
// porte le typage précis de SON type de ligne (évite l'invariance de R au bord vue).
export function pickAdapter(level: NavLevel, ctx: ScopeCtx): ConnectorScopeAdapter<any> {
  switch (level) {
    case 'org':
      return useOrgAdapter(ctx)
    case 'platform':
      return usePlatformAdapter(ctx)
    case 'team':
      return useTeamAdapter(ctx)
    default:   // 'work' = user (mon espace)
      return useUserAdapter(ctx)
  }
}
