# `/automations` — suivre les agents hébergés

L'écran des agents qui tournent **pour** l'org, sans elle. Route `/automations`, vue
`views/console/AutomationsView.vue`. Refondu par **oto#205** : le lot 1 (13/09/2026) porte la
**lecture juste** ; les gestes (armer, arrêter, relancer, régler un déclencheur) sont le lot 2,
la vue d'ensemble du coût le lot 3.

Usages, par priorité (Alexis, 13/09) : **suivre une campagne**, **piloter**, **vue d'ensemble**.

## Les sections, dans l'ordre où on lit l'écran

| section | composant | ce qu'elle lit |
|---|---|---|
| Runner | `components/console/automations/RunnerPresenceBanner.vue` | le bloc `runner` de `runner.triggers op=list`, remonté par la carte des déclencheurs (événement `runner`) — la présence est une propriété de l'org, servie là |
| Campagnes | `automations/CampaignsSection.vue` + `CampaignCard.vue` | `runner.fleets op=list`, puis `op=state` par carte **ouverte** |
| Travaux d'une campagne | `automations/RunnerJobList.vue` | `runner.jobs op=list` paginé, filtre `fleet_id` |
| Travaux hors campagne | `automations/OffCampaignSection.vue` (repliée) | deux `RunnerJobList`, filtres `source=scheduled` et `source=manual` |
| Déclencheurs | `components/console/RunnerTriggersCard.vue` | `runner.triggers op=list` ; aussi montée sur la fiche d'une procédure |
| Routines Claude Code | `automations/RoutinesSection.vue` | les instances du connecteur `routine` |

Plus la **fiche d'un travail**, `components/console/RunnerJobDetail.vue`, que la page tient et
qu'ouvrent toutes les listes.

## Ce qui est partagé, et où

- **`lib/runnerFleets.ts`** — une campagne : `libelleCampagne` (statut → clé i18n + ton),
  `repartir` (vivantes / récentes / anciennes), `armeeSansTravail`, `compteurs`.
- **`lib/runnerJobs.ts`** — un travail : `libelleTravail`, `coutTravail` (connu / inconnu),
  `modeleTravail`, `jetons`, `instant` (dates UTC), `bail`, la lecture du `result`.
- **`composables/useRafraichissement.ts`** — le rafraîchissement de la page (voir plus bas).
- **`composables/useCibleRun.ts`** — l'arrivée par `?run=` depuis une ligne de tableau.

Toute la copie neuve vit sous `automations.*` dans `locales/fr.json` et `locales/en.json`.
Les chaînes plus anciennes de la fiche et de la carte des déclencheurs restent écrites en
français dans le gabarit.

## Les règles du modèle, et ce qui les tient

Fixées par la session flotte dans oto#205.

- **`armed` est une intention, `running` un fait.** `armed` se dit « armée, en attente du premier
  travail », jamais « en cours ». Au-delà d'**une minute** sans premier travail (`armed_at` servi),
  la carte le dit : d'après la plateforme, aucun worker ne sonde la file de l'org.
- **`stopping` est une demande** : « arrêt demandé, N en vol » — la dépense continue tant qu'un
  travail est en vol. Jamais « arrêtée ».
- **`stopped` porte son motif** (`stop_reason`), ou dit qu'il n'est pas écrit.
- **Une flotte `draft` qui porte des travaux est un historique** de l'ancien ordonnanceur : elle
  se lit d'après ses travaux. Tant que `op=state` n'est pas lu, une `draft` se dit « non armée » —
  elle ne peut pas encore savoir si elle est brouillon ou historique.
- `done` / `failed` sont inatteignables côté serveur, **libellés quand même** ; un statut inconnu
  se montre tel quel (« statut inconnu : x »), jamais rangé sous un voisin.
- **Le battement ne se lit pas.** « ne bat plus » a disparu : seul l'ancien ordonnanceur posait
  `heartbeat_at`, et une campagne neuve passait pour morte.
- **Travail** : `expired` a son libellé — personne n'est venu le prendre, **ce n'est pas un
  échec**. `done` n'est pas un succès métier.
- **Coût** : `usage_tokens` = entrée hors cache + sortie, et s'affiche sous ce nom. Un travail
  sans résultat a un coût **inconnu**, jamais 0. Un modèle absent se dit « modèle non déclaré ».
  Pas de jauge de budget : le plafond n'est pas appliqué. ⚠️ `heaviest_row_tokens` est le
  maximum de jetons **par travail**, malgré son nom : il se dit « travail le plus lourd », jamais
  « ligne » (un travail qui trouve la file vide consomme sans tenir de ligne).
- **Les compteurs d'une campagne sont ceux de TOUTE la campagne** (`op=state`), jamais ceux d'une
  fenêtre de travaux chargés. ⚠️ `abandoned` est un **sous-ensemble** de `failed` (échecs au
  plafond de tentatives) : il se dit « dont abandonnés », sinon la somme dépasse le total.

`lib/runnerFleets.spec.ts` et `lib/runnerJobs.spec.ts` tiennent la table statut → libellé ;
`components/console/automations/automations.spec.ts` tient ce que l'écran affiche d'une réponse.

## Ordre et repli des campagnes

Les **vivantes** (`armed`, `running`, `stopping`) d'abord, puis les **récentes** (un changement
d'état déclaré dans les 7 derniers jours : armement, démarrage, demande d'arrêt, arrêt,
création), puis un repli « N campagnes anciennes » à compteur vrai. Les cartes vivantes et
récentes s'ouvrent seules ; une carte repliée ne lit son `op=state` qu'à l'ouverture. Une
campagne sans aucune date lisible va au repli : on ne la prétend pas récente.

## Rafraîchissement

Avant oto#205, la file relisait les 120 derniers travaux toutes les 30 s, **onglet caché
compris** — 89 % des appels de la route. Désormais (`useRafraichissement`) :

- chaque section **s'inscrit** avec son chargeur ; une carte fermée ne relit rien, une liste
  démontée se désinscrit ;
- **rien ne part onglet caché** ; revenir sur l'onglet relit tout, une fois ;
- l'**intervalle** (30 s) ne tourne que s'il existe une **campagne vivante** ;
- **un seul** bouton « Rafraîchir », en tête, avec un état de chargement ;
- une liste relit autant de lignes qu'elle en affiche : un rafraîchissement ne replie pas ce qui
  a été déroulé (le serveur écrête une demande trop grande et rend un curseur).

## Erreurs

- **Le 403 `beta_required`** de `runner.fleets` se dit « Campagnes non activées pour cette
  organisation », sans rouge : ce n'est pas une panne. Un autre 403 reste une erreur.
- **Une erreur reste dans sa section** : campagnes, carte, liste de travaux, présence du runner,
  interrupteur d'un déclencheur. Elle s'efface à la lecture suivante réussie.
- Défaut corrigé au passage : une erreur d'`op=state` (ancienne carte des flottes) ou d'un
  interrupteur remplaçait toute la liste et ne s'effaçait jamais.
- Le bandeau runner et l'alerte « armée sans premier travail » sont des `Notice warn`
  **informatives** (aucun geste réclamé) : classées comme telles dans `alerteLevier.tripwire.spec.ts`.

## Ce que l'API ne permet pas (13/09/2026)

- **Aucun filtre « sans campagne » d'un seul mot.** `source=scheduled` (déclencheur) et
  `source=manual` (appel direct) sont, côté serveur, les deux moitiés exactes de
  `fleet_id IS NULL` : la section hors campagne affiche donc deux listes, chacune avec son total
  vrai, plutôt qu'un filtre reconstruit sur une fenêtre.
- **Pas de cache par campagne** : `op=state` ne rend ni `usage_cache_read` ni `usage_cache_write`.
  Le cache ne se lit que sur la fiche d'un travail.
- **`usage_tokens` de campagne est sommé avec un repli à 0.** Tant qu'aucun travail n'est conclu,
  ce 0 ne mesure rien : la carte dit « inconnu ». Dès qu'un travail est conclu, le nombre servi
  fait foi — sans pouvoir distinguer un vrai 0 de travaux qui ne déclarent pas leurs jetons.
- **`workers`** (bloc `runner`) compte des **identités** de worker vues récemment — des secrets
  déclarés —, pas des processus. Le bandeau le libelle ainsi.
- ⚠️ **Le `workers` d'une CAMPAGNE (flotte) n'est pas appliqué en hébergé** : stocké et
  modifiable, mais `campagne_a_servir` ne le lit pas. Le parallélisme réel est le nombre de
  travaux `claimed` (le compteur « en vol »). L'écran ne l'affiche pas ; s'il l'affiche un jour,
  c'est « déclaré, non appliqué », jamais « parallélisme ».
- ⚠️ **`max_rows` borne des TRAVAUX produits**, quel que soit leur statut, pas des lignes écrites :
  un travail qui trouve la file vide en consomme un, une reprise n'en crée pas. L'écran ne
  l'affiche pas ; toute mention future s'écrit « N travaux sur max_rows ».
  `automations.spec.ts` tient ces deux silences.
- **Pas de lecture d'un travail par run.** `?run=` cherche parmi les travaux `claimed` (une page,
  200 au plus) : les liens ne partent que d'une ligne qu'un run tient, donc d'un travail en vol.
  Hors de cette page, ou déjà conclu, l'écran le dit.

## La fiche d'un travail

`RunnerJobDetail.vue` : l'échec en toutes lettres, l'identité (dates, **modèle**, **jetons**,
tentatives, bail, worker, run), ce que le travail visait (le `payload`), ce qu'il a produit (le
`result`), et son fil.

**Le `result` est rendu en TROIS temps**, parce que son contrat est ouvert (`JobResult`
`extra=allow`) : les postes qu'on sait nommer (étapes, motif d'arrêt, détail des jetons), le
relevé d'outils, puis **tout le reste sous sa clé brute**. Sans ce troisième temps, un champ que
le worker vient d'ajouter resterait invisible, et « l'écran ne le montre pas » se lirait « le
worker ne le produit pas ».

## Aller d'une ligne à son travail, et retour

- **ligne → travail** : `DatastoreQueueBar.vue` et `RowDrawer.vue` pointent vers
  `/automations?run=<run>` pour une ligne tenue par un run ; `useCibleRun` ouvre la fiche.
- **travail → ligne** : seulement pour un travail **en cours**, par la file de travail du tableau
  visé, adressé par **identifiant** (`payload.datastore_id`, oto#160). Sur un travail **conclu**,
  la ligne travaillée n'est plus retrouvable — `_claimed_run` dit sur quelle ligne un run est
  *maintenant*, jamais laquelle il a travaillée — et la fiche le dit au lieu de laisser un silence.

## Retiré par oto#205 (13/09/2026)

- **La carte « Surveillance »** (bandeau des postes de garde, tuiles d'écritures, « réservations
  sans écriture », agents qui traînent) et **la « File d'exécution »** : elles lisaient les 120
  derniers travaux, soit moins d'une heure de production, et les présentaient comme la campagne.
- **Les postes de garde et « réservé, rien écrit »** dans la fiche : le runner n'écrit plus
  `claims`, `writes`, `faux_depart`, `claim_vide`, `hors_schema` ni les postes de garde depuis le
  **01/09**, par choix. Leurs blocs peignaient un zéro qui avait l'air d'un succès. Sur un travail
  ancien, ces champs restent lisibles sous leur clé brute.
- **Le jugement « hors flotte » sur `payload.fleet`** : le rattachement est `fleet_id`.
- **Le double « Rafraîchir »** et la carte « Automatisations », devenue « Routines Claude Code ».

## Pièges vécus

⚠️ **Les horodatages arrivent en UTC SANS fuseau** (`2026-08-28 13:53:53`). `Date.parse` les lit
comme heure LOCALE : un travail de l'instant s'afficherait « il y a 2 h » l'été. Toute lecture de
date passe par **`instant()`** (`lib/runnerJobs.ts`).

⚠️ **Un écran de surveillance qui n'a jamais rien montré se suspecte avant de se croire.** Les
postes de garde, des LISTES de noms, ont été lus comme des entiers : une liste lue comme un
nombre vaut zéro, et le bandeau ne s'est jamais affiché. Puis le runner a cessé de les écrire, et
le même bandeau est resté vide pour une autre raison, invisible d'ici. Deux zéros qui avaient
l'air de bonnes nouvelles.

⚠️ **`null` ne veut pas dire « rien » : il veut dire que personne n'a regardé.** Même règle pour
un coût : absent = inconnu, jamais 0.

⚠️ **`lease_until` ne se lit JAMAIS sans le statut.** Sur un travail conclu, la date est le bail
qui **était** tenu : l'afficher « expiré » accuserait de mort un travail terminé normalement.
Le croisement est tenu dans `bail()`.

⚠️ **Le fil d'un run n'a pas la même forme selon le chemin d'exécution** (`text` ou `content`
+ relevé d'outils), et **un fil vide n'est pas une panne** : quand la boucle d'outils tourne chez
le fournisseur, seul l'ordre et une synthèse reviennent.

⚠️ **Une page absente de `PAGE_META` retombe SILENCIEUSEMENT sur l'overview.**
`lib/consoleNav.spec.ts` tient la règle.

## Contrats consommés

`listRunnerFleets()` · `getRunnerFleetState(id)` · `listRunnerJobs(filtre, page)` ·
`getRunThread(run_id)` · `getNamespaceQueue(id)` · `listRunnerTriggers(procedure?)` ·
`setRunnerTriggerEnabled(id, on)` · `getConnectorInstances()` — tous dans `api/console.ts`.
`RunnerFleet`, `RunnerFleetState` et `RunnerArme` sont **dérivés** du document OpenAPI
(`types/api.ts`) ; `RunnerJob` reste écrit à la main (contrat ouvert de `result`, statut `string`
parce que le serveur sert aussi `expired`), avec `lease_until` pris dans `types/api.attendu.ts`.
