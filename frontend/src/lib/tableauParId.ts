// La RÉSOLUTION d'un tableau désigné — par un lien de projet, une adresse `/data/<ref>` —
// en son entrée servie (oto#160, 29/09/2026). Une liste d'org ne rend plus ni le perso ni
// les partages faits à moi : un tableau lié qui n'y est pas se LIT PAR IDENTIFIANT
// (`getDatastore`), dont l'accès ne dépend pas des listes. C'est la seule résolution :
// `DatastoreTable` et `ProjectWorkQueues` la partagent.
//
// ⚠️ L'identifiant AVANT le nom, dans la liste : un identifiant ne désigne qu'un tableau,
// un nom peut en désigner plusieurs (homonymie, oto#160). Chercher les deux clés dans la
// même passe laissait l'ordre de la liste trancher.
//
// Pas de repli silencieux : `null` veut dire « inconnu ou inaccessible » (le 404 déclaré,
// qui ne distingue pas les deux), et TOUTE autre erreur remonte.
import { ApiError } from '@/api'
import { getDatastore } from '@/api/console'
import type { DatastoreEntry } from '@/types/api'

export const CODE_TABLEAU_INTROUVABLE = 'datastore_not_found'

export function estTableauIntrouvable(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404 && e.code === CODE_TABLEAU_INTROUVABLE
}

/** Le tableau que `ref` désigne : dans `liste` (identifiant, puis nom), sinon lu par
 * identifiant. `null` = inconnu ou inaccessible ; toute autre erreur remonte. */
export async function resoudreTableau(ref: string, liste: readonly DatastoreEntry[]): Promise<DatastoreEntry | null> {
  const trouve = liste.find((n) => String(n.id) === ref) ?? liste.find((n) => n.datastore === ref)
  if (trouve) return trouve
  try {
    return await getDatastore(ref)
  } catch (e) {
    if (estTableauIntrouvable(e)) return null
    throw e
  }
}
