// La clé qui sert le membre lui PARVIENT d'un niveau partagé — il n'a rien à saisir.
//
// Retour du 01/10/2026 : sur un connecteur dont la clé est posée par l'org, l'écran
// d'un membre lui laissait croire qu'il devait l'installer « de zéro » et coller sa
// propre clé (formulaire de champs, « Connecter X »), alors que le connecteur
// résolvait déjà pour lui par la cascade.
//
// Lu sur le mode GAGNANT de `/api/me` (`ProviderStatus.mode`, miroir de
// `access/status.py::status_for`) — jamais deviné de la présence d'une clé ici ou
// là : c'est la cascade du serveur qui dit d'où vient la clé.
import type { ProviderStatus } from '@/types/api'

export type SharedKeySource = 'org' | 'group' | 'tenant' | 'platform'

/** Le niveau partagé qui fournit la clé au membre, ou `null` s'il n'y en a pas
 *  (aucune clé, sa propre clé, ou quota plateforme épuisé — il a alors quelque chose
 *  à faire). En org perso, une clé d'org ou d'équipe EST la sienne : rien de
 *  « fourni par quelqu'un d'autre » à dire. */
export function sharedKeySource(
  ps: ProviderStatus | undefined,
  opts: { isPersonal?: boolean } = {},
): SharedKeySource | null {
  if (!ps || ps.user_key_configured) return null
  switch (ps.mode) {
    case 'org':
    case 'group':
      return opts.isPersonal ? null : ps.mode
    case 'tenant':
    case 'platform':
      return ps.mode
    default:
      return null
  }
}
