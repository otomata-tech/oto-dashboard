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

// ── ③ Les trois postes de garde, enfin DÉCLARÉS ────────────────────────────
// Ils étaient déjà servis (`JobResult` est `extra=allow`), mais *servi* n'est pas
// *déclaré* : aucune forme garantie nulle part. D'où une erreur qu'on a commise —
// les lire comme des COMPTEURS alors que ce sont des LISTES DE NOMS. Une liste
// lue comme un nombre vaut zéro, et le bandeau de garde ne s'affichait jamais.
//
// ⚠️ LE PIÈGE DU LOT. `valeurs_cliente_detruites` a **trois** états, pas deux :
//
//   `["ville", "tel"]`  ces colonnes ont été détruites
//   `[]`                MESURÉ, rien de détruit
//   `null`              **NON MESURÉ** — le harnais n'a pas pu identifier la ligne
//                       travaillée (le chemin « conversations » la résout par alias
//                       et n'y arrive pas toujours), la garde n'a pas tourné
//
// Afficher « aucune destruction » là où personne n'a regardé est exactement le
// défaut que ces postes existent pour empêcher. `null` doit se voir comme un état
// à part, ni succès ni échec.
export interface PostesDeGarde {
  /** Colonnes du client REMISES EN PLACE depuis `<colonne>.origine`. `[]` = la
   * garde a tourné et n'a rien eu à réparer. Une ligne réparée reste une faute :
   * réparer ne doit pas faire disparaître le défaut du décompte. */
  valeurs_cliente_reparees?: string[]
  /** Contacts fabriqués RETIRÉS de la ligne (leurs noms) — retirés, pas
   * seulement signalés : une ligne signalée se fait quand même appeler.
   * `[]` = la garde a tourné et n'en a trouvé aucun. */
  contacts_fabriques_retires?: string[]
  /** Colonnes du client trouvées DÉTRUITES. ⚠️ `null` = NON MESURÉ, jamais zéro. */
  valeurs_cliente_detruites?: string[] | null
}
