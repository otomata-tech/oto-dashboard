// Quel champ NOMME une ligne — et un seul endroit pour le dire.
//
// Le serveur nomme une ligne depuis `display: "title"` (oto-backend#317 étape A :
// les rôles sont retirés du schéma, plus aucune lecture de `role` côté serveur).
// Le dashboard, lui, titrait depuis `role: "title"` — à TROIS endroits, chacun
// avec sa propre expression (`byRole('title')[0]`, `find(d => d.role === …)`,
// `find(f => f.role === …)?.key`).
//
// ⚠️ C'est cette triplication qui a produit la divergence, pas la clé elle-même.
// Corriger en écrivant trois fois la cascade `display` puis `role` armerait le
// piège suivant : le quatrième site l'oubliera, et rien ne criera. D'où un
// résolveur unique — la règle est écrite une fois, les appelants l'appellent.
//
// ⚠️ Le repli sur `role` porte une MIGRATION, pas une dette : la conversion des
// 57 schémas a été faite en additif (`display` ajouté, `role` conservé), donc les
// deux clés coexistent aujourd'hui.
//
// SA CONDITION DE DÉMONTAGE, écrite ici pour qu'elle ne se perde pas : le repli
// meurt quand la purge des clés `role` en base sera passée, et cette purge est
// elle-même gatée sur le déploiement de CE correctif. L'ordre est mécanique —
// le dashboard lit `display` d'abord partout, ALORS les schémas peuvent perdre
// leurs clés `role`, ALORS le repli ne sert plus rien. Critère mesurable au
// moment venu : **zéro schéma en base portant `role: "title"`**.
//
// Le retirer avant fait perdre son titre à une ligne, sans erreur : une table
// qui s'affiche par des identifiants.

import type { DatastoreField } from '../types/api'

/**
 * Le champ qui nomme une ligne, ou `null` si le schéma n'en désigne aucun.
 *
 * ⚠️ `display` d'ABORD. Un schéma neuf ne déclare que lui — c'est la convention
 * documentée — et le lire en second ferait gagner un `role` résiduel sur la
 * déclaration courante.
 */
export function champTitre(fields: DatastoreField[] | null | undefined): DatastoreField | null {
  const liste = fields ?? []
  return (
    liste.find((f) => f?.display === 'title') ??
    liste.find((f) => f?.role === 'title') ??
    null
  )
}

/** Sa clé seule — ce qu'attendent les composants qui lisent `row[cle]`. */
export function cleTitre(fields: DatastoreField[] | null | undefined): string | null {
  return champTitre(fields)?.key ?? null
}
