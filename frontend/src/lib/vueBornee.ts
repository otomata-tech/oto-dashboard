// La vue BORNÉE « voir en tant que » d'un org_admin (oto#270) : l'admin d'org voit, en
// lecture seule, ce qu'un membre de SON org voit DANS cette org. Le serveur la sert sur une
// liste fermée de lectures et refuse le reste en `403 view_as_hors_org` (jetons API,
// facturation, instances de connecteurs, admin…).
//
// ⚠️ Ce que la vue refuse, le SERVEUR le dit : `/api/me` sert `view_as_bound_org` (l'org de
// la vue, `null` hors vue bornée) et `view_as_refused_prefixes` (les préfixes des lectures
// GET refusées), dérivés de ce que son middleware applique. Ce module n'en recopie rien : il
// garde la dernière lecture de `/api/me` (`poserVueBornee`, appelé par `useMe`) et la lit.
//   • `api()` ne lance pas une lecture GET couverte (même refus que le serveur, sans
//     l'aller-retour) — préfixe de chaîne, SLASH FINAL COMPRIS : `/api/connectors/` refusé
//     ne couvre pas `/api/connectors` exact, qui reste ouvert.
//   • La nav et la garde du routeur masquent un ÉCRAN (`SECTIONS_HORS_VUE`) quand la lecture
//     qui le fait vivre est refusée — la seule chose que le front ajoute : quel écran lit
//     quoi, une notion d'écran que le serveur ne connaît pas.
//   • Un écran qui lit en partie une liste refusée se masque sur `estHorsVue`.
// Avant la première lecture de `/api/me`, rien n'est masqué ni retenu : le serveur reste
// l'autorité, et un refus arrivé entre-temps se dit par `estHorsVue`, jamais en rouge.

/** Ce que `/api/me` dit de la vue bornée ; `null` tant qu'il n'est pas lu. */
interface VueServie { org: number; refuses: readonly string[] }
let vue: VueServie | null = null

/** Retient ce que `/api/me` sert (appelé à chaque lecture de `/api/me`). */
export function poserVueBornee(me: {
  view_as_bound_org?: number | null; view_as_refused_prefixes?: string[] | null
} | null): void {
  vue = me?.view_as_bound_org != null
    ? { org: me.view_as_bound_org, refuses: me.view_as_refused_prefixes ?? [] }
    : null
}

/** L'org à laquelle le SERVEUR borne la vue ; `null` hors vue bornée (ou `/api/me` non lu). */
export function orgDeLaVue(): number | null {
  return vue?.org ?? null
}
export const enVueBornee = (): boolean => vue !== null

/** Préfixe de chaîne, sans normaliser le slash : c'est le contrat servi. */
const refusee = (chemin: string): boolean =>
  !!vue && vue.refuses.some((p) => chemin.startsWith(p))

/** Une lecture GET que la vue refuse. Une écriture n'est pas jugée ici : la vue est en
 * lecture seule, le serveur la refuse déjà. */
export function lectureHorsVue(chemin: string, methode = 'GET'): boolean {
  return methode.toUpperCase() === 'GET' && refusee(chemin)
}

/** Les écrans d'une vue bornée, et la lecture qui les fait vivre : masqués quand le serveur
 * la refuse. Préfixes de section → chemin REST lu à l'ouverture. */
export const SECTIONS_HORS_VUE: Readonly<Record<string, string>> = {
  '/org/billing': '/api/me/billing',                        // facturation
  '/account/claude': '/api/me/model-subscriptions',          // abonnements de modèles
  '/account/developers': '/api/me/tokens',                   // jetons API
  '/platform': '/api/admin/users',                           // admin
}
/** ⚠️ `/account/security` : la MFA est lue sur Logto pour le compte CONNECTÉ, jamais pour
 * le membre vu — aucune lecture du serveur ne le dit, c'est une règle d'écran. */
const SECTIONS_TOUJOURS_HORS_VUE: readonly string[] = ['/account/security']

const sousSection = (section: string, p: string) => section === p || section.startsWith(`${p}/`)

export function sectionHorsVue(section: string): boolean {
  if (!vue) return false
  if (SECTIONS_TOUJOURS_HORS_VUE.some((p) => sousSection(section, p))) return true
  return Object.entries(SECTIONS_HORS_VUE).some(([p, lecture]) => sousSection(section, p) && refusee(lecture))
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
