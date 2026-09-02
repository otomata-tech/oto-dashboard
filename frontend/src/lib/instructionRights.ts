// Droits d'une procédure : CHAQUE GESTE LIT LE DRAPEAU DE SON GESTE (oto-dashboard#144,
// oto-backend#695 puis #719).
//
// Le serveur a dissocié deux verbes qui partageaient une règle : **écrire** une procédure
// (et **restaurer** une version, qui n'en est que le défaire) demande d'être MEMBRE de
// l'équipe propriétaire ; **supprimer** demande d'en être le CHEF, parce que ça emporte
// l'historique et que ce n'est pas réversible.
//
// `can_edit` — le drapeau historique — dit le droit d'ADMINISTRER l'équipe. Le lire pour
// ouvrir l'édition ferme la porte à une membre qui a le droit d'écrire ; l'élargir
// ouvrirait un bouton de suppression que le serveur refuse.
//
// ⚠️ Le serveur DIT ces deux droits, on ne les RE-DÉRIVE pas ici : une règle recalculée
// côté client dérive silencieusement de celle qu'applique le backend le jour où celui-ci
// la change. `GET /api/me/instructions` et `GET /api/groups/{id}/instructions` les
// servent, requis (mesuré sur mcp.oto.cx et mcp.oto.ninja le 2026-09-02).
//
// ⚠️ Une absence n'est PAS un « non » : un champ absent = un serveur plus ancien (un
// retour arrière de tag, p.ex.) qui ne sait pas encore répondre à la question. Absent →
// on prend le `repli` que l'appelant fournit, à défaut l'ancien sens de `can_edit`. Un
// `false` SERVI, lui, est un vrai refus et gagne (d'où `??`, jamais `||`).
import type { InstructionRights } from '@/types/api'

/** Ce dont on sait tirer des droits : les deux bundles de la famille (org et équipe),
 *  qui portent les MÊMES noms exprès — un composant factorisé n'a pas à savoir sur
 *  quelle page il est. */
export type InstructionRightsSource = InstructionRights & { can_edit?: boolean }

export interface ResolvedInstructionRights {
  /** ouvrir l'édition · enregistrer · créer · restaurer une version passée */
  canWrite: boolean
  /** supprimer une procédure (et son historique) */
  canDelete: boolean
}

/**
 * @param bundle  ce que le serveur a servi (ou `null` : pas encore chargé).
 * @param repli   ce que l'appelant sait déjà par ailleurs, à n'utiliser QUE si le serveur
 *                ne répond pas à la question. L'écran d'équipe, lui, connaît le rôle du
 *                requérant (`useTeamScope`) : c'est un meilleur repli que `can_edit`, qui
 *                fermerait l'écriture à une membre. Omis → repli sur `can_edit`.
 */
export function instructionRights(
  bundle: InstructionRightsSource | null | undefined,
  repli?: Partial<ResolvedInstructionRights>,
): ResolvedInstructionRights {
  const legacy = bundle?.can_edit ?? false
  return {
    canWrite: bundle?.can_write_instructions ?? repli?.canWrite ?? legacy,
    canDelete: bundle?.can_delete_instructions ?? repli?.canDelete ?? legacy,
  }
}
