// Quel widget de connexion rendre pour un connecteur — DÉRIVÉ de son descripteur
// d'auth backend (ADR 0024), jamais de son nom.
//
// ⚠️ POURQUOI CE FICHIER EXISTE. `AuthDescriptor.method` est un jeu de valeurs FERMÉ
// côté backend (`oto_mcp/providers.py::auth_method`, gelé par `tests/test_auth_descriptor.py`)
// et consommé ici. Le type TypeScript le déclare fermé — mais un type est une CLAIM sur
// l'API, pas une vérification : quand le backend a ajouté `secret_then_oauth` (28/07),
// TS n'a rien vu et le `switch` est tombé dans son `default`, qui rendait… rien. La carte
// Salesforce est restée VIDE en prod : ni formulaire, ni bouton, un client ne pouvait même
// pas coller sa clé. Échec silencieux, cross-repo, invisible aux deux CI.
//
// D'où la règle : une méthode inconnue ne retombe PAS sur un rendu vide, elle rend
// `'unknown'` — que l'appelant DOIT afficher explicitement. Un dashboard en retard sur le
// backend le dit, au lieu de faire disparaître la fonctionnalité.

import type { AuthDescriptor } from '@/types/api'

/** Les méthodes que ce front sait rendre. Doit rester en phase avec le jeu fermé du
 *  backend (`providers.auth_method`) — le test de ce fichier est le rappel mécanique. */
export const HANDLED_AUTH_METHODS = [
  'secret', 'oauth', 'cookie', 'hosted', 'remote', 'none',
] as const

export type WidgetKind =
  | 'key'        // formulaire de champs (le cas majoritaire : 50 connecteurs sur 70)
  | 'session'    // session navigateur hébergée (live view)
  | 'google'     // oauth multi-compte
  | 'oauth_federated' // oauth mono-compte (fédéré : atlassian, folkmcp…)
  | 'unipile'    // flux hébergé tiers
  | 'remote'     // pont d'org, provisionné par l'org
  | 'opendata'   // aucun credential
  | 'unknown'    // le backend sert une méthode que ce front ne connaît pas

/**
 * Widget à rendre pour ce descripteur d'auth.
 *
 * `unknown` n'est pas un cas d'erreur théorique : c'est l'état NORMAL d'un dashboard
 * déployé avant le backend qui l'accompagne. Il doit être visible, pas silencieux.
 */
export function connectWidgetKind(auth: Pick<AuthDescriptor, 'method' | 'cardinality'>): WidgetKind {
  switch (auth.method) {
    case 'hosted': return 'unipile'
    case 'cookie': return 'session'
    case 'oauth': return auth.cardinality === 'multi_account' ? 'google' : 'oauth_federated'
    case 'secret': return 'key'
    case 'remote': return 'remote'
    case 'none': return 'opendata'
    default: return 'unknown'
  }
}
