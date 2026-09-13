// Le contrat SERVI PAR UN LOT QUI N'EST PAS ENCORE DÉPLOYÉ.
//
// ⚠️ Provenance, et pourquoi ces types ne sont pas dans `api.generated.ts` :
// ils viennent de `otomata-tech/oto-backend` PR #723 (« Servir le travail des
// agents », branche `feat/servir-le-travail-des-agents`), **ouverte, ni mergée ni
// déployée**. `api.generated.ts` se régénère depuis l'OpenAPI du backend EN LIGNE :
// régénérer aujourd'hui EFFACERAIT ces champs. Ils sont donc écrits à la main,
// ici, à part — un fichier qu'on relit et qu'on supprime d'un coup le jour où la
// PR est déployée, plutôt que trois déclarations semées dans le code qui
// survivraient à leur raison d'être.
//
// À la fusion : vérifier que l'OpenAPI régénéré porte bien ces champs, puis
// remplacer les usages par les types générés et supprimer ce fichier.

// ── ① Le bail d'une ligne dit POUR QUEL RUN ────────────────────────────────
// Le datastore rendait à QUI la ligne est réservée (`_claimed_by`) et JUSQU'À
// QUAND (`_claimed_until`), jamais POUR QUEL RUN. Une vue de supervision voyait
// donc qu'un agent tenait une ligne, jamais lequel tenait laquelle.
//
// ⚠️ TROIS états, qui ne se confondent pas :
//
//   `_claimed_run: "<run>"`  ce run tient la ligne — l'adresse du travail en cours
//   `_claimed_run: null`     bail pris SANS run (une personne sur la file du
//                            dashboard, un agent sans `_run_id`) — un FAIT, pas un trou
//   clé absente              aucun bail (comme `_claimed_by`)
//
// ⚠️ Ce qu'il ne dit PAS : « sur quelle ligne ce run est-il MAINTENANT », jamais
// « laquelle a-t-il travaillée ». La colonne est effacée quand le run rend ses
// lignes. Le lien vers la ligne d'un travail CONCLU n'existe pas encore — il
// viendra du harnais (dépôt `oto-runner`), et l'écran doit le dire au lieu de le
// simuler.
export interface BailDeLaLigne {
  _claimed_run?: string | null
}

// ── ② Le bail d'un travail, sur `list` et `get` ────────────────────────────
// `lease_until` n'était rendu qu'à `op=claim`, donc au seul worker qui venait de
// prendre le job. Servi maintenant partout, et **à lire CONTRE `status`** :
//
//   `pending` jamais pris   `null`
//   `claimed`               fin du bail EN COURS — passée = le worker est parti,
//                           le job est re-claimable
//   `done`                  le bail qui ÉTAIT tenu, laissé tel quel
//   échec re-filé           `null` — la prise est rendue avec le job
//
// ⚠️ Le piège : sur un travail conclu, une date passée n'est PAS « expiré ».
// L'information est vraie, elle est simplement passée. Cf. `lib/runnerJobs.ts`,
// qui refuse de la lire sans le statut.
export interface BailDuTravail {
  lease_until?: string | null
}

// ── ③ Changer de moyen de paiement (#845 ①) ────────────────────────────────
// Servi par la PRÉPRODUCTION (`POST /api/me/billing/method` et
// `POST /api/me/billing/method/confirm`, schémas inline `MethodChangeStarted` et
// `MethodChangeResult` — relevés sur le document OpenAPI de `mcp.oto.ninja` le
// 2026-09-05, oto-backend `595a20a0`), PAS encore par la production. Même régime
// que tout ce fichier : cette section se supprime au premier tag qui emporte le lot,
// au profit des types dérivés.
//
// Le geste passe par un premier paiement à 0,00 sur la page hébergée du PSP —
// aucun mouvement d'argent — puis par `confirm` au retour du navigateur.
/** Ce que rend l'OUVERTURE du changement. */
export interface BillingMethodChangeStarted {
  /** La page de paiement hébergée. `null` = le PSP n'en a pas rendu : ne pas
   * rediriger vers rien. */
  checkout_url: string | null
  payment_id: string | null
  /** ⚠️ À AFFICHER AVANT d'envoyer la personne chez le prestataire : l'ancien
   * moyen reste actif tant que le nouveau n'est pas confirmé. Sans cette phrase,
   * qui abandonne le checkout croit s'être coupé. Recopiée telle quelle. */
  notice: string
}

/** Ce que rend la CONFIRMATION au retour (ou en re-sonde). Toutes les branches
 * sont des 200 discriminées par `status`, comme pour la souscription :
 *
 *   `changed`          bascule faite, l'ancien moyen révoqué (ou pas — voir
 *                      `previous_revoked`, un ménage raté ne défait pas la bascule)
 *   `pending`          pas encore encaissé — la personne est peut-être encore
 *                      sur la page du prestataire
 *   `pending_mandate`  encaissé, mandat pas encore visible chez le PSP : une
 *                      ATTENTE, jamais un échec — l'ancien moyen tient
 *   `failed`           la carte a refusé l'autorisation à zéro : l'ancien moyen
 *                      est INTACT, la copie servie le dit
 *   `already_current`  rejeu : le mandat courant est déjà celui-là
 *
 * ⚠️ `status` est un `str` côté serveur (pas un ensemble fermé déclaré) : l'écran
 * garde une branche pour une valeur qu'il ne connaît pas. */
export interface BillingMethodChangeResult {
  status: string
  payment_status?: string | null
  mandate_id?: string | null
  previous_mandate_id?: string | null
  /** `false` AVEC `status: "changed"` = la bascule est faite, seul le ménage de
   * l'ancien mandat a raté. Rien à montrer : l'encaissement suivant prend le
   * nouveau moyen. */
  previous_revoked?: boolean | null
  /** La phrase du serveur, à recopier — c'est lui qui sait si l'ancien moyen
   * tient encore. Vide sur `already_current`. */
  notice: string
}

// ── ③ L'identité de facturation vue de l'ADMIN PLATEFORME (oto-backend#917) ──
// Servi par oto-backend 88f99440 (tronc, preprod) — pas encore dans le snapshot
// OpenAPI, qui se rafraîchit depuis la PROD. Le client Pennylane d'une org se
// DÉSIGNE à la main par un admin plateforme : `null` = aucun client désigné, donc
// aucune facture ne partira. Le formulaire admin reposte la fiche ENTIÈRE plus
// l'id (remplace, ne fusionne pas) ; omis ou `null` RETIRE la désignation.
// À la mise en prod : `npm run api:refresh`, puis `AdminBillingIdentityView =
// ApiOut<'admin_orgs_billing_identity_get_get'>` et supprimer ce bloc.
import type { BillingIdentityInput, BillingIdentityView } from './api'

export type AdminBillingIdentityView = BillingIdentityView & { pennylane_customer_id: number | null }
export type AdminBillingIdentityInput = BillingIdentityInput & { pennylane_customer_id?: number | null }
