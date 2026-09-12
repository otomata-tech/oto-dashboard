// Provenance d'une installation, dite au membre (ADR 0050 §E9/§E10, oto#166).
//
// « Posé par le kit de ton organisation » n'est pas « installé par toi » : c'est
// précisément ce que `origin` (servi par `GET /api/me/connectors`) permet enfin de dire.
// Libellés arrêtés pour l'étage écran du kit, verbatim. Deux provenances seulement
// portent un badge :
//  • `kit`   → « installé par ton organisation » (le membre peut le retirer) ;
//  • `admin` → « ouvert par un administrateur ».
// `membre` (installé par toi) est le cas ordinaire, sans badge. `socle` (population
// résiduelle) et `inconnue` (ligne antérieure à la trace) n'ont pas de libellé arrêté :
// aucun badge plutôt qu'un mot inventé. Un connecteur NON installé n'en porte aucun,
// quelle que soit la provenance de son installation passée.
import type { ConnectorState, InstallOrigin } from '@/types/api'

export interface OriginBadge { text: string }

const BADGES: Partial<Record<InstallOrigin, string>> = {
  kit: 'installé par ton organisation',
  admin: 'ouvert par un administrateur',
}

export function originBadge(
  origin: InstallOrigin | null | undefined, state: ConnectorState,
): OriginBadge | null {
  if (state === 'not_selected' || !origin) return null
  const text = BADGES[origin]
  return text ? { text } : null
}
