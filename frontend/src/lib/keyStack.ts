// Logique de la PILE de clés (KeyStack, CDC lot 2 §5) — extraite du composant pour
// être testable : c'est elle qui décide ce que la pile AFFICHE et ce que le dialog de
// retrait ANNONCE. Une erreur ici ne casse rien visuellement, elle fait mentir l'UI —
// d'où la lib pure + les specs (même patron que `connectorVerdict.ts`).
//
// Elle doit rester le MIROIR de la cascade backend (`access.walk_cascade`) :
//   clé membre (sub, org) > clé de l'ÉQUIPE ACTIVE > clé d'org > grant plateforme
import type { ConnectorInstance } from '@/types/api'

export type RowState = 'used' | 'reserve' | 'suspended' | 'inactive_team'

/**
 * Une clé d'équipe ne résout QUE si c'est l'équipe ACTIVE : `walk_cascade` ne consulte
 * qu'un seul groupe (`current_group`). Or la liste d'instances renvoie TOUTES les
 * équipes lisibles — les miennes, et toutes celles de l'org pour un org_admin (escalade
 * `roles.py`). Sans ce filtre, une clé parfaitement inerte s'affiche « en réserve —
 * prendrait le relais » et le dialog de retrait l'annonce comme filet de sécurité.
 */
export function isInactiveTeam(i: ConnectorInstance, activeGroup: number | null): boolean {
  if (i.level !== 'group' || i.via === 'shared_with_me') return false
  return activeGroup == null || String(i.owner.id) !== String(activeGroup)
}

/**
 * État d'une ligne dans la cascade. L'ordre des tests compte : « équipe inactive »
 * passe AVANT « utilisée », sinon deux clés d'équipe (l'active + une autre) sont toutes
 * deux marquées « utilisée » quand c'est le palier équipe qui résout — `level` seul ne
 * les distingue pas.
 */
export function rowState(
  i: ConnectorInstance, effective: string | null, activeGroup: number | null,
): RowState {
  if (i.suspended) return 'suspended'
  if (isInactiveTeam(i, activeGroup)) return 'inactive_team'
  if (i.level === effective && i.via !== 'shared_with_me') return 'used'
  return 'reserve'
}

/**
 * Le relais = ce qui résoudrait À LA PLACE de la clé retirée : la plus proche en
 * dessous, non suspendue, hors prêt nominatif (qui s'utilise par épinglage, jamais en
 * repli automatique) et hors équipe inactive (inerte).
 */
export function relayOf(
  rows: ConnectorInstance[], memberRow: ConnectorInstance | undefined, activeGroup: number | null,
): ConnectorInstance | null {
  return rows.find((i) => i !== memberRow && !i.suspended && i.via !== 'shared_with_me'
    && !isInactiveTeam(i, activeGroup)) ?? null
}

/**
 * Le drapeau de santé (`ProviderStatus.health_ko`) n'est PAS une propriété du connecteur :
 * `status_for` (backend) ne le lit que sur la clé MEMBRE de compte par défaut de l'acteur.
 * Le porter sur la ligne « utilisée » mentirait dès que cette clé est suspendue — c'est
 * alors l'org qui résout, et sa santé à elle n'est pas mesurée.
 */
export function isHealthKo(i: ConnectorInstance, healthKo: boolean): boolean {
  return healthKo && i.level === 'member' && i.via !== 'shared_with_me' && !i.account
}
