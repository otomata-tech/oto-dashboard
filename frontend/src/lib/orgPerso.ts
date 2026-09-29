// « L'org ne montre que l'org » (oto#160 ; Alexis, 28–29/09/2026). Dans une org non
// personnelle on ne voit QUE l'org : ce qu'elle et ses équipes possèdent, et ce qu'on leur
// partage. Ce qui est À MOI ou partagé à MOI en personne se lit dans mon ORG PERSO
// (`me.active_org_is_personal`), et nulle part ailleurs.
//
// Les LENTILLES « moi » — les lectures qui rendent ce qui est partagé à moi en personne :
// projets `scope=me`, pages `shared_with_me` `scope=me`, tableaux `/api/me/datastores/shared`
// — ne sont servies que dans l'org perso ; ailleurs le serveur les refuse (`CODE_HORS_ORG_PERSO`).
// Ce module est la SEULE règle du front :
//   • `lentilleMoi` enveloppe chaque lentille dans `api/console.ts` : hors org perso elle ne
//     part pas et rend le vide, donc la section qui la lit n'apparaît pas (ni appel, ni
//     section vide, ni erreur). Tant que `/api/me` n'est pas lu, elle ne part pas non plus.
//   • Un refus du serveur qui arrive quand même (course à un changement d'org) rend le vide :
//     « pas ici » n'est pas une panne.
//   • `enOrgPerso(me)` est la même règle pour un écran (libellés des dialogues de création).
// ⚠️ L'état vient de `useMe` (`poserOrgPerso` à chaque lecture de `/api/me`), comme la vue
// bornée (`lib/vueBornee.ts`) : ce module n'importe pas `useMe`, qui importe l'API.
import type { Me } from '@/types/api'

type AvecOrgPerso = Pick<Me, 'active_org_is_personal'>

/** Le refus déclaré du serveur pour une lentille « moi » lue hors de l'org perso. Le statut
 * n'est pas encore fixé (409 a priori) : seul le code compte. */
export const CODE_HORS_ORG_PERSO = 'personal_view_outside_personal_org'

/** L'org active est-elle l'org perso ? Faux tant que `me` n'est pas lu. */
export function enOrgPerso(me: AvecOrgPerso | null | undefined): boolean {
  return me?.active_org_is_personal === true
}

let dernierMe: AvecOrgPerso | null = null

/** Retient ce que `/api/me` sert (appelé à chaque lecture de `/api/me`). */
export function poserOrgPerso(me: AvecOrgPerso | null): void {
  dernierMe = me
}

/** Le refus « pas hors de l'org perso », quel que soit son statut HTTP. */
export function estHorsOrgPerso(e: unknown): boolean {
  const x = e as { code?: string } | null
  return !!x && x.code === CODE_HORS_ORG_PERSO
}

/** Une lentille « moi » : lue seulement dans l'org perso, `vide` partout ailleurs. */
export async function lentilleMoi<T>(lecture: () => Promise<T>, vide: T): Promise<T> {
  if (!enOrgPerso(dernierMe)) return vide
  try {
    return await lecture()
  } catch (e) {
    if (estHorsOrgPerso(e)) return vide
    throw e
  }
}
