// L'org PERSO (`me.active_org_is_personal`) : depuis le 29/09/2026 (Alexis), une org perso est
// une org comme une autre — « perso » n'est qu'une étiquette, du même genre que la maison. Les
// lentilles « moi » (projets `scope=me`, pages `shared_with_me` `scope=me`, tableaux
// `/api/me/datastores/shared`) sont servies dans toute org, et un objet perso se liste pour son
// propriétaire dans l'org où il l'a créé.
//
// Ce qui lit encore l'étiquette ne touche qu'à la présentation ou au commerce : le bandeau
// d'abonnement (on ne pousse à s'abonner que dans une org d'équipe) et la section « Mes projets »
// de la barre, toujours présente dans l'org perso.
import type { Me } from '@/types/api'

type AvecOrgPerso = Pick<Me, 'active_org_is_personal'>

/** L'org active est-elle l'org perso ? Faux tant que `me` n'est pas lu. */
export function enOrgPerso(me: AvecOrgPerso | null | undefined): boolean {
  return me?.active_org_is_personal === true
}
