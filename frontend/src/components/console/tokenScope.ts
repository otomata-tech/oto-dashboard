// La portée d'un jeton et la borne de son label — extraits du composant pour être
// TESTABLES (oto-dashboard#161). Ce sont les deux endroits où l'écran peut mentir au
// backend : une portée mal construite, et une borne de saisie plus large que la sienne.
import * as z from 'zod'
import type { TokenScopes } from '@/api/console'

/** La portée à envoyer, ou `undefined` si rien n'est choisi.
 *
 * ⚠️ `undefined` et `{}` ne disent PAS la même chose : une portée vide est un jeton
 * qui n'ouvre rien, alors qu'aucune portée veut dire « tous mes droits dans cette
 * org ». Construire l'objet par accumulation produit naturellement le premier en
 * croyant dire le second. */
export function porteeDepuis(
  nsRights: Record<string, 'read' | 'write' | undefined>,
  projRead: Record<string, true>,
): TokenScopes | undefined {
  const ns = Object.fromEntries(Object.entries(nsRights).filter(([, v]) => !!v)) as
    Record<string, 'read' | 'write'>
  const pr = Object.fromEntries(Object.keys(projRead).map((k) => [k, 'read' as const]))
  if (!Object.keys(ns).length && !Object.keys(pr).length) return undefined
  return {
    ...(Object.keys(ns).length ? { namespaces: ns } : {}),
    ...(Object.keys(pr).length ? { projects: pr } : {}),
  }
}

/** 32 — la borne du BACKEND (`label_too_long`, 400), pas une de plus. */
export const schemaLabel = z.string().trim().min(1, 'Label requis')
  .max(32, 'Trop long (max 32 caractères)')
