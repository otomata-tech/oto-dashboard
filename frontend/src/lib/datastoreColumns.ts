// Quelles colonnes d'un tableau du datastore sont-elles À L'UTILISATEUR — et
// lesquelles, parmi celles-là, sont VISIBLES. Extrait de DataTable.vue (où cette
// règle vivait dupliquée, à la portée d'un composant) pour que l'export CSV
// (oto-dashboard#137) la partage plutôt que de la réécrire à sa manière : c'est
// exactement cette divergence — deux calculs du « quelles colonnes » — qui a
// laissé `_claimed_by`/`_claimed_until` fuiter dans un export pensé pour le seul
// écran.
import type { DatastoreField, DatastoreSchema } from '@/types/api'

/**
 * Colonnes UTILISATEUR d'un jeu de lignes : l'union des clés servies, dans leur
 * ordre de première apparition, moins tout ce que la plateforme y ajoute.
 *
 * La règle est `!k.startsWith('_')`, pas une liste énumérée de noms connus —
 * c'est la convention que le serveur applique déjà pour rendre ses propres vues
 * (`_cellules`/`_unknown_filter_keys` côté oto-backend) : une colonne posée par
 * l'utilisateur ne peut pas commencer par `_`, ce préfixe est réservé aux champs
 * système (`_id`, `_created_at`, `_updated_at`, `_claimed_by`, `_claimed_until`…).
 * Une exclusion nommée oublie la prochaine colonne interne ; celle-ci la couvre
 * par construction.
 */
export function userFields(rows: Array<Record<string, unknown>>): string[] {
  const seen: string[] = []
  for (const row of rows)
    for (const k of Object.keys(row))
      if (!k.startsWith('_') && !seen.includes(k)) seen.push(k)
  return seen
}

/** Colonnes par défaut : tout ce que le schéma ne masque pas, dans l'ordre de `fields`. */
export function defaultColumns(fields: string[], schema?: DatastoreSchema | null): string[] {
  const schemaFields = schema?.fields ?? []
  if (!schemaFields.length) return fields
  const byKey: Record<string, DatastoreField> = {}
  for (const f of schemaFields) if (f.key) byKey[f.key] = f
  return fields.filter((k) => byKey[k]?.hidden !== true)
}

/**
 * Colonnes VISIBLES : le choix ponctuel de l'utilisateur (`chosen`, miroir de
 * `?cols=`) prime s'il existe, sinon le schéma décide (`hidden` enregistré par
 * « enregistrer la vue »). Toujours restreint aux colonnes réellement présentes
 * dans `fields` — un `?cols=` qui pointe une colonne disparue depuis ne doit pas
 * survivre.
 */
export function visibleColumns(
  fields: string[],
  schema: DatastoreSchema | null | undefined,
  chosen: string[] | null,
): string[] {
  return (chosen ?? defaultColumns(fields, schema)).filter((k) => fields.includes(k))
}

/**
 * Le patch de `hidden` qu'« enregistrer comme vue par défaut » doit envoyer :
 * UNIQUEMENT les colonnes du menu dont l'état demandé diffère de ce que le schéma
 * déclare aujourd'hui. Rien d'autre n'est nommé — donc rien d'autre ne bouge.
 *
 * Le geste précédent reposait le schéma ENTIER (`PUT`) reconstruit depuis la liste
 * connue du front : il retirait `hidden` de TOUS les champs avant de le reposer sur
 * les seuls décochés. Un aller-retour dans ce menu rendait donc visibles, pour tout
 * le monde, les colonnes masquées ailleurs — par un agent, ou sur une colonne absente
 * de la page courante, donc absente du menu. Le bouton vit au milieu de gestes
 * purement locaux (miroir d'URL) : l'effet global ne se voyait pas.
 *
 * - `menuFields` : les colonnes que ce menu gouverne (celles des lignes affichées).
 *   Ce qui n'y est pas n'est jamais nommé.
 * - `hidden` : celles que l'utilisateur laisse décochées.
 * - Un champ que le schéma ne déclare pas est ignoré : le nommer l'AJOUTERAIT au
 *   schéma, ce qui change ce que le tableau accepte (`strict`, `unknown_fields`) —
 *   une décision de gouvernance, pas un réglage d'affichage.
 * - Recocher écrit `hidden: false` plutôt que d'ôter la clé : la fusion par clé du
 *   serveur écrase les propriétés nommées, elle n'en supprime aucune, et
 *   `defaultColumns` lit `!== true`, donc `false` affiche exactement comme l'absence.
 */
export function hiddenPatch(
  menuFields: string[],
  hidden: string[],
  schema: DatastoreSchema | null | undefined,
): Array<{ key: string; hidden: boolean }> {
  const declared: Record<string, DatastoreField> = {}
  for (const f of schema?.fields ?? []) if (f.key) declared[f.key] = f
  const wanted = new Set(hidden)
  const patch: Array<{ key: string; hidden: boolean }> = []
  for (const k of menuFields) {
    const f = declared[k]
    if (!f) continue
    const next = wanted.has(k)
    if ((f.hidden === true) !== next) patch.push({ key: k, hidden: next })
  }
  return patch
}
