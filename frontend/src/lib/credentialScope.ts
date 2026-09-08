// À quel PALIER un credential peut être posé — lu sur le connecteur, jamais choisi
// à l'écran.
//
// ⚠️ **MIROIR d'une garde serveur**, comme `credentialForm.ts` l'est de `fields_for`.
// Le backend décide l'éligibilité PAR PALIER (`me_credentials._credentialable`) :
// `byo_user` au palier membre, org-partageable aux paliers équipe et org. Un écran
// qui ignore cette règle propose un formulaire que le serveur refusera après la
// saisie — c'est exactement ce qui est arrivé à `http`, et donc à TOUS les ponts
// clients (ADR 0003/0037) : `POST /api/settings/api-keys/http` rend
// `404 unknown_provider` quoi qu'on tape, parce que cette route ne connaît QUE le
// palier membre (elle n'a pas de champ `scope` — le palier n'y est pas omis, il n'y
// existe pas). La pose au palier org passe par une autre route,
// `PUT /api/orgs/{id}/secrets/{provider}`.
//
// Toute évolution de l'éligibilité par palier se fait des DEUX côtés.

/** Les paliers où un credential se SAISIT. `platform` n'en est pas un : la clé
 *  plateforme s'octroie côté opérateur, elle ne se colle pas dans un formulaire. */
export type CredentialScope = 'member' | 'group' | 'org'

/** Le palier auquel poser le credential de ce connecteur, vu depuis l'écran d'un
 *  membre — ou `null` si aucun ne se saisit (clé plateforme seule).
 *
 *  Règle : le membre pose la sienne dès que le connecteur l'accepte (elle prime dans
 *  la cascade) ; sinon, si le connecteur est partageable, c'est la clé de l'org.
 *
 *  ⚠️ `auth_modes` est `Optional` au contrat : un backend plus ancien peut ne pas le
 *  servir. **Absent ⇒ palier membre**, le comportement historique — on ne détourne
 *  jamais une pose vers l'org sur une absence de donnée, sinon un silence du serveur
 *  poserait une clé partagée à qui n'a demandé que la sienne. */
export function poseScope(
  authModes: string[] | null | undefined,
): CredentialScope | null {
  if (!authModes) return 'member'
  if (authModes.includes('byo_user')) return 'member'
  if (authModes.includes('byo_org')) return 'org'
  // Déclaré, mais sans aucun mode « apporte ta clé » : rien à saisir ici. Une liste
  // VIDE dit la même chose qu'une liste sans mode BYO — c'est une déclaration, pas
  // une absence (le cas « pas servi » est traité au-dessus).
  return null
}
