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


// ── ② Les FLOTTES : la configuration déclarée d'un passage ─────────────────
// Servi par la PRÉPRODUCTION (`/api/me/runner/fleets`, schémas `Fleet` et
// `FleetState` — vérifié sur le document OpenAPI de `mcp.oto.ninja`), PAS encore
// par la production : le lot est mergé sur le tronc, la prod part au tag.
// `api.generated.ts` se régénère depuis la PROD — régénérer aujourd'hui
// effacerait ces types. Ils vivent donc ici, à part, et cette section se supprime
// d'un coup au premier tag qui emporte le lot.
/** Une FLOTTE : la configuration DÉCLARÉE d'un passage d'agents.
 *
 * Une flotte vivait dans un fichier YAML sur une machine — invisible d'ici.
 * Ce qu'elle porte est ce qui donne un domicile aux gardes : sa CIBLE
 * (`namespace` + `row_filter`, figés à la déclaration), son contexte
 * d'exécution (`provider`/`model`, figés aussi — les changer en vol rendrait
 * fausse l'attribution des lignes déjà écrites), et ses BORNES.
 *
 * ⚠️ Le budget se compte en JETONS, jamais en monnaie : les tarifs changent et
 * diffèrent par fournisseur. La conversion appartient à qui lit, avec un tarif
 * daté — ne JAMAIS l'afficher en euros ici. */
export interface RunnerFleet {
  id: number
  label: string | null
  procedure: string | null
  namespace: string | null
  row_filter: Record<string, unknown> | null
  provider: string | null
  model: string | null
  tools: string[] | null
  workers: number | null
  max_rows: number | null
  max_tokens: number | null
  max_tokens_per_row: number | null
  max_consecutive_failures: number | null
  status: string | null
  /** ÉCRIT, jamais déduit du statut : « arrêtée » sans raison oblige à rouvrir
   * les journaux pour savoir si le budget a coupé ou si la file s'est vidée. */
  stop_reason: string | null
  started_at: string | null
  /** Le battement de l'ordonnanceur. Une flotte `running` qui ne bat plus n'est
   * pas une concurrence à attendre : c'est un RÉSIDU de passage mort. */
  heartbeat_at: string | null
  stopped_at: string | null
  created_at: string | null
}

/** L'avancement d'un passage, agrégé sur ses travaux.
 *
 * ⚠️ `no_jobs_attached` est DÉCLARÉ, pas déduit de compteurs à zéro. Un zéro qui
 * peut vouloir dire « rien trouvé » ou « personne n'a regardé » est le défaut le
 * plus coûteux de ce chantier : l'écran doit dire « aucun travail rattaché », pas
 * afficher des zéros qui ressemblent à un passage vide et sage. */
export interface RunnerFleetState {
  jobs_total: number
  pending?: number | null
  claimed?: number | null
  done?: number | null
  failed?: number | null
  abandoned?: number | null
  usage_tokens?: number | null
  /** La ligne la PLUS LOURDE du passage — à ne pas confondre avec le plafond
   * `max_tokens_per_row`, qui est une borne, pas une mesure. */
  heaviest_row_tokens?: number | null
  last_finished?: string | null
  no_jobs_attached: boolean
}


// ── ③ Changer de moyen de paiement (#845 ①) ────────────────────────────────
// Servi par la PRÉPRODUCTION (`POST /api/me/billing/method` et
// `POST /api/me/billing/method/confirm`, schémas inline `MethodChangeStarted` et
// `MethodChangeResult` — relevés sur le document OpenAPI de `mcp.oto.ninja` le
// 2026-09-05, oto-backend `595a20a0`), PAS encore par la production. Même régime
// que la section ② : cette section se supprime au premier tag qui emporte le lot,
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
