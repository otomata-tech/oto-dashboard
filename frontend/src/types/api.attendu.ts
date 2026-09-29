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

// ── ④ L'émetteur déclaré d'une ligne du journal d'accès (otomata-tech/oto#187) ──
// Servi par oto-backend `c03fa8fd` (tag v1.348.0) sur `AuditCall`
// (`GET /api/orgs/{id}/audit-log/export`) — le snapshot OpenAPI commité date de
// v1.341.0 et ne le porte pas encore. Le logiciel client que la session a nommé à son
// `initialize`, et le mode de jeton (`user` | `delegation` ; `null` = session OAuth).
// ⚠️ DÉCLARÉ par le client : lisible, jamais opposable. `null` partout = ligne
// antérieure au lot. Au prochain `npm run api:refresh`, remplacer par le type généré
// et supprimer ce bloc.
export interface EmetteurDeclare {
  client_name?: string | null
  client_version?: string | null
  token_kind?: string | null
}

// ── ⑤ La vue bornée d'un org_admin, dite par le serveur (otomata-tech/oto#270) ──
// Servi par oto-backend `a7e02e4c` (pas encore déployé) — le snapshot OpenAPI ne le
// porte pas. Sur `/api/me` : `view_as_bound_org` = l'org de la vue bornée (`null` hors
// vue bornée, y compris en vue d'opérateur) ; `view_as_refused_prefixes` = les préfixes
// des LECTURES GET refusées en `403 view_as_hors_org` dans cette vue (`null` hors vue
// bornée), dérivés par le serveur de ce que son middleware applique, SLASH FINAL GARDÉ
// (`/api/connectors/` refusé, `/api/connectors` exact ouvert : comparer par préfixe de
// chaîne, sans normaliser). Sur `OrgMemberEntry` (`GET /api/orgs/{id}`) :
// `is_platform_operator`, servi au seul org_admin (et à l'opérateur), `null` pour un
// membre ordinaire. Au prochain `npm run api:refresh`, remplacer par les types générés
// et supprimer ce bloc.
export interface VueBorneeServie {
  view_as_bound_org?: number | null
  view_as_refused_prefixes?: string[] | null
}
export interface OperateurDuMembre {
  is_platform_operator?: boolean | null
}

// ── ⑥ Lire un tableau par son identifiant (otomata-tech/oto#160) ────────────
// Servi par oto-backend `763f88dd` (pas encore déployé) — le snapshot OpenAPI ne porte
// pas la route. `GET /api/datastores/{datastore}` (capacité `me.datastore.get_datastore`)
// rend UNE `DatastoreEntry`, la forme d'un élément de `GET /api/datastores` : `shared:false`
// si le tableau est à l'appelant, à l'org consultée ou à une équipe à portée, sinon
// `shared:true` avec `permission` et `can_write`. L'accès ne dépend ni des listes ni de
// l'org consultée. Inconnu ou inaccessible : 404 `datastore_not_found`, la même réponse
// dans les deux cas. Aucun type nouveau (la réponse est une `DatastoreEntry`) : ce bloc
// dit seulement pourquoi `getDatastore` appelle une route absente du snapshot. Au
// prochain `npm run api:refresh`, vérifier que le snapshot la porte et supprimer ce bloc.
