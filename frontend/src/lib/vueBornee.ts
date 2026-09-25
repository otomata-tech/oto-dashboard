// La vue BORNÉE « voir en tant que » d'un org_admin (oto#270) : l'admin d'org voit, en
// lecture seule, ce qu'un membre de SON org voit DANS cette org. Le serveur la sert sur une
// liste FERMÉE de lectures (`api.routes._LECTURES_VUE_BORNEE`) et refuse tout le reste en
// `403 view_as_hors_org` : jetons API, grants de comptes connecteurs, tableaux partagés
// « avec moi », abonnements de modèles, instances de connecteurs, facturation, légal,
// bibliothèques, `/api/resources`, admin — des lectures « compte entier ».
//
// Ce module est la SEULE liste de ce que l'écran masque dans cette vue. La nav
// (`navItemVisible`) et la garde du routeur lisent `SECTIONS_HORS_VUE` ; `api()` lit
// `LECTURES_HORS_VUE` et ne part même pas (même refus que le serveur, sans l'aller-retour) ;
// un écran qui lit en partie l'une de ces listes se masque sur `estHorsVue`. Hors de ce
// module, aucun écran ne redit ce qui est hors vue. Le serveur reste l'autorité : une
// lecture absente d'ici et refusée là-bas se dit par `estHorsVue`, jamais en rouge.
import { getViewUser } from './viewOrg'

/** L'org à laquelle la vue est bornée, figée à l'entrée ; `null` hors vue bornée. */
export function orgDeLaVue(): number | null {
  return getViewUser()?.org?.id ?? null
}
export const enVueBornee = (): boolean => orgDeLaVue() !== null

/** Les écrans dont les lectures sont refusées en vue bornée : absents du menu, et une
 * adresse directe retombe sur l'aperçu. Préfixes de section. */
export const SECTIONS_HORS_VUE: readonly string[] = [
  '/org/billing',         // facturation
  '/account/security',    // la MFA est celle du compte CONNECTÉ (Logto), jamais du membre vu
  '/account/claude',      // abonnements de modèles
  '/account/developers',  // jetons API
  '/platform',            // admin
]

/** Les lectures refusées en vue bornée que des écrans OUVERTS font en partie. */
export const LECTURES_HORS_VUE: readonly string[] = [
  '/api/me/connector-instances',
  '/api/me/connector-accounts/grants',
  '/api/me/datastores/shared',
  '/api/me/model-subscriptions',
  '/api/me/tokens',
  '/api/me/legal',
  '/api/me/billing',     // `/api/billing/plans` (le catalogue) reste servi
  '/api/resources',
  '/api/admin/',
]

const couvre = (liste: readonly string[], chemin: string) =>
  liste.some((p) => chemin === p || chemin.startsWith(p.endsWith('/') ? p : `${p}/`)
    || chemin.startsWith(`${p}?`))

export function sectionHorsVue(section: string): boolean {
  return enVueBornee() && couvre(SECTIONS_HORS_VUE, section)
}

export function lectureHorsVue(chemin: string): boolean {
  return enVueBornee() && couvre(LECTURES_HORS_VUE, chemin)
}

export const CODE_HORS_VUE = 'view_as_hors_org'

/** Le refus « pas dans cette vue », du serveur ou de `api()`. */
export function estHorsVue(e: unknown): boolean {
  const x = e as { status?: number; code?: string } | null
  return !!x && x.status === 403 && x.code === CODE_HORS_VUE
}

/** Une lecture dont l'absence EST la réponse en vue bornée (le serveur n'y compte pas ce
 * qui lui est refusé) : `vide` sur « pas dans cette vue », toute autre erreur remonte. */
export async function horsVueVide<T>(lecture: Promise<T>, vide: T): Promise<T> {
  try {
    return await lecture
  } catch (e) {
    if (estHorsVue(e)) return vide
    throw e
  }
}
