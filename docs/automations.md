# `/automations` — suivre les agents hébergés

Les agents qui tournent **pour** l'org, sans elle. Refondu par **oto#205** : le lot 1
(13/09/2026) porte la **lecture juste** ; le lot 2 les **gestes** (armer, relancer, arrêter une
campagne ; régler et supprimer un déclencheur) ; la vue d'ensemble du coût est le lot 3.
**oto#214** (13/09/2026) en fait un **espace** : une entrée et des pages adressables, sous une
navigation persistante **Campagnes · Programmations · Exécutions** — comprendre ce qui va se
lancer, régler ce qui est réglable, comprendre ce qui a eu lieu. Aucune écriture nouvelle.

Usages, par priorité (Alexis, 13/09) : **suivre une campagne**, **piloter**, **vue d'ensemble**.

## Le lexique (tranché par le plan le 13/09/2026, oto#214)

Seuls les **textes produit** suivent ce lexique, en français et en anglais : les identifiants de
code, les noms d'API, les routes et les clés i18n existantes ne changent pas.

| mot produit (en) | ce que c'est | entité, identifiant technique |
|---|---|---|
| **procédure** (procedure) | les instructions réutilisables ; jamais un agent ; lien vers la page Procédures | `/api/me/instructions*`, `Doctrine*View`, `/procedures/:id` |
| **campagne** (campaign) | un lot de travail : une procédure, une cible, des bornes ; jamais « flotte » | `runner.fleets` (`/api/me/runner/fleets`), `RunnerFleet`, `fleet_id` |
| **programmation** (schedule) | ce qui lance des exécutions : à l'horaire servi, ou à chaque livraison de sa source (`kind: webhook`) ; jamais « déclencheur » | `runner.triggers` (`/api/me/runner/triggers`), `RunnerTrigger`, `trigger_id` |
| **exécution** (execution) | un travail lancé, son état, son résultat ; terminée ne veut pas dire réussie ; jamais « travail » ni « job » | `runner.jobs` (table `runner_jobs`), `RunnerJob`, `job_id` |
| **tentative** (attempt) | un essai du même travail : seulement le compte servi, aucun historique inventé | `runner_jobs.attempts` / `max_attempts` |
| **journal** (log) | les échanges disponibles pour une exécution : le fil de son run | `runs.thread` (`/api/me/runs/thread`), `run_id` — un run et une exécution sont deux identités, sans correspondance un pour un |
| **agent** | l'exécutant logiciel qui lit une procédure et appelle des outils ; jamais une procédure ni une campagne | — |
| **worker** | la capacité technique qui prend les exécutions ; le bandeau runner, un diagnostic, le nomme ainsi | `RunnerArme.workers`, `claimed_by` |
| **routine Claude Code** | nom conservé tel quel, jamais « programmation » | connecteur `routine`, `/api/me/automations/fire` |

« travail » garde ses autres sens : l'espace de travail, la file de travail d'un tableau. Garde :
`lib/lexiqueAutomations.tripwire.spec.ts` (copie `automations.*` en fr et en, gabarits et
littéraux des pages et composants de l'espace), avec sa contre-épreuve. Les phrases du serveur
affichées mot pour mot (un refus) ne sont pas les nôtres et n'y passent pas. Une seule exception,
nommée par son sens — la **citation d'un libellé d'interface tierce** : le texte des routines cite
l'écran d'Anthropic tel qu'il s'affiche, en anglais (« Add another trigger → API »), sur la seule clé
`automations.routines.empty` et pour cette seule citation.

## L'espace et ses pages (oto#214)

Le routeur n'a pas de routes enfants : chaque page est une route **plate** de section
`/automations` (surlignage du menu), distinguée par `meta.detail`, enregistrée nue et préfixée
`/o/:orgId[/g/:groupId]` comme toute page de travail. **`lib/automationsEspace.ts` est la seule
liste de ces pages** : le routeur (`detailRoutes`), la barre du haut (`DETAIL_META`), la
navigation, le fil d'Ariane et les tests la lisent. La vue d'espace
(`views/console/AutomationsView.vue`) reste montée d'une page à l'autre ; elle tient l'en-tête
(fil, `SubTabs`, « Rafraîchir ») et le rafraîchissement, et monte la page de
`views/console/automations/`, remontée à chaque changement de **chemin** (jamais de query).

| adresse | page | ce qu'elle lit |
|---|---|---|
| `/automations` | `AutomationsHomeView` — runner, « à surveiller », routines ; l'ancien `?run=` | `triggers op=list` (présence + pertes), `fleets op=list` (vivantes), `jobs op=list status=failed limit=5`, instances du connecteur `routine` |
| `/automations/campaigns[?status=live\|stopped\|draft]` | `CampaignsView` — la liste des lots 1-2, filtrée | `fleets op=list` (complète, sans pagination : le filtre ne porte pas sur une fenêtre) |
| `/automations/campaigns/:id[?shown=N]` | `CampaignView` — identité en lecture, gestes, compteurs, historique | `fleets op=get`, `fleets op=state`, `jobs op=list fleet_id=` |
| `/automations/schedules` | `SchedulesView` — la carte des programmations, telle quelle | `triggers op=list` |
| `/automations/schedules/:id[?shown=N]` | `ScheduleView` — activation, horaire en mots, fuseau, modèle, prochaine exécution, pertes, historique ; un webhook remplace horaire, fuseau et prochaine exécution par l'adresse à donner à la source, ses livraisons sur 24 h, sa file et ses 50 dernières livraisons (`WebhookDeliveries`) | `triggers op=get` (avec `runner`), `jobs op=list trigger_id=`, `triggers op=deliveries` (webhook) |
| `/automations/schedules/:id/settings` | `ScheduleSettingsView` — interrupteur, formulaire, suppression, sans rien y ajouter | `triggers op=get` ; gestes `op=update`, `op=delete` |
| `/automations/executions[?source=&status=&campaign=&schedule=&shown=N]` | `ExecutionsView` — suivi transverse ; `schedule` est le lien « voir dans le suivi » d'une programmation | `jobs op=list` sous les filtres servis ; `fleets op=list` et `triggers op=list` pour nommer les filtres par campagne et par programmation |
| `/automations/executions/:id` | `ExecutionView` — la fiche (`RunnerJobDetail`), liens vers sa campagne ou sa programmation | `jobs op=get` |

- **Une adresse n'affiche que l'objet qu'elle désigne** (`useLectureParId` + `ObjetAdresse`) :
  un `:id` qui n'est pas un entier positif se dit sans appel ; un 404 se dit avec son code ; la
  bêta absente se dit sans rouge. `:id` n'est pas contraint dans le routeur : une adresse
  invalide retomberait sinon en silence sur l'aperçu.
- **L'URL porte la lecture** : les filtres (une entrée d'historique par changement) et ce qui a
  été déroulé (`?shown=`, remplacé à chaque « Afficher la suite ») — un retour depuis la page
  d'une exécution retrouve les mêmes lignes. Un filtre inconnu (`status=expired`) se dit ignoré.
- **Deux lectures pour une campagne, chacune avec son erreur** : `op=get` ouvre la page, et c'est
  la seule que la consultation en lecture seule laisse passer ; `op=state` (compteurs) n'est
  **pas** dans la liste blanche du serveur (`_READ_OPS`, `api/routes.py`) : en consultation elle
  répond 403 `view_as_read_only`, et seule la section des compteurs le dit. Les deux rendent la
  flotte : la plus récemment **demandée** fait foi, et la réponse d'un geste passe devant.
- **« À surveiller »** montre les campagnes vivantes (et « armée sans premier travail »), les
  programmations dont `expired_count > 0`, et les cinq dernières exécutions en échec avec un lien
  vers toutes. Rien n'y est calculé sur une fenêtre.
- **Droits** : ceux des lots 1-2, inchangés. Sur une programmation, tout membre règle hors
  consultation — la réserve admin décidée pour activer et configurer (Q7) n'est **pas servie** :
  aucun texte ne la suppose et aucune garde front ne la simule.

## Les sections, dans l'ordre où on lit l'écran

| section | composant | ce qu'elle lit |
|---|---|---|
| Runner | `components/console/automations/RunnerPresenceBanner.vue` | le bloc `runner` de `runner.triggers op=list`, lu par l'entrée avec la liste (`useProgrammations`) — la présence est une propriété de l'org, servie là |
| Campagnes | `automations/CampaignsSection.vue` + `CampaignCard.vue` + `CampaignSummary.vue` + `CampaignActions.vue` | `runner.fleets op=list`, puis `op=state` par carte **ouverte** (`useLectureCampagne`) ; gestes `op=launch` / `op=stop` |
| Travaux d'une campagne | `automations/RunnerJobList.vue` | `runner.jobs op=list` paginé, filtre `fleet_id` ; chaque ligne mène à la page de son exécution |
| Déclencheurs | `components/console/RunnerTriggersCard.vue` + `automations/TriggerRow.vue` + `automations/TriggerSettingsForm.vue` | `runner.triggers op=list` ; gestes `op=update` (partiel) et `op=delete` (`useGestesDeclencheur`) ; la même carte est montée sur la fiche d'une procédure |
| À surveiller | `automations/WatchSection.vue` | voir l'entrée, ci-dessus |
| Routines Claude Code | `automations/RoutinesSection.vue` | les instances du connecteur `routine` |

Plus la **fiche d'un travail**, `components/console/RunnerJobDetail.vue`, corps de la page d'une
exécution.

## Ce qui est partagé, et où

- **`lib/runnerFleets.ts`** — une campagne : `libelleCampagne` (statut → clé i18n + ton),
  `repartir` (vivantes / récentes / anciennes), `armeeSansTravail`, `compteurs`.
- **`lib/runnerJobs.ts`** — un travail : `libelleTravail`, `coutTravail` (connu / inconnu),
  `modeleTravail`, `jetons`, `instant` (dates UTC), `bail`, la lecture du `result`.
- **`lib/runnerGestes.ts`** — les gestes : `droits`, `gestesCampagne` (statut × état × droits),
  `borneAtteinte` (R1), `MOTIF_ECHECS_CONSECUTIFS` (R2), `fusionnerLecture`, `refusServi` ; pour un
  déclencheur, `reglageInitial`, `champsModifies`, `apresReglage`, `modeleDeclencheur`,
  `optionsModele`, `fuseauxProposes`.
- **`composables/useGesteObserve.ts`** — un geste en quatre temps : confirmation, envoi,
  observation, refus.
- **`automations/ConfirmerSurPlace.vue`** et **`automations/RefusServi.vue`** — la confirmation
  sur place, et un refus du serveur tel qu'il l'a écrit.
- **`composables/useRafraichissement.ts`** — le rafraîchissement de la page (voir plus bas).
- **`composables/useCibleRun.ts`** — l'arrivée par `?run=` depuis une ligne de tableau.
- **`lib/automationsEspace.ts`** (oto#214) — la liste des pages, la navigation, le fil d'Ariane,
  ce qu'une adresse porte (`idDAdresse`), les filtres de l'URL, `historiqueDe` (le filtre serveur
  de l'historique d'un objet), `nomProgrammation`, `programmationDe`.
- **`composables/useLectureParId.ts`** + **`automations/ObjetAdresse.vue`** — lire l'objet
  qu'une adresse désigne, et en dire l'issue.
- **`composables/useLectureCampagne.ts`** — les compteurs d'une campagne (`op=state`), pour la
  carte comme pour la page ; **`automations/CampaignSummary.vue`** — leur rendu, avec les gestes.
- **`composables/useGestesDeclencheur.ts`** — l'interrupteur et la suppression d'une
  programmation, pour la ligne comme pour la page des réglages.
- **`composables/useProgrammations.ts`** — la liste des programmations et la présence du runner,
  en une lecture. **`composables/useAffichesUrl.ts`** — `?shown=`.

Toute la copie neuve vit sous `automations.*` dans `locales/fr.json` et `locales/en.json`.
Les chaînes plus anciennes de la fiche, de la carte des déclencheurs et d'une ligne de
déclencheur (`TriggerRow`) restent écrites en français dans le gabarit.

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

## Les gestes sur une campagne (lot 2)

`automations/CampaignActions.vue`, en tête du corps d'une carte ouverte. Qui voit quoi :

| statut servi | admin d'org | membre | lecture seule |
|---|---|---|---|
| `draft`, `op=state` pas encore lu | rien | rien | rien |
| `draft` sans travail (`no_jobs_attached`) | Armer | rien | rien |
| `draft` avec travaux (historique) | levier nommé | rien | rien |
| `armed`, `running` | Arrêter | Arrêter | rien |
| `stopping` | message d'arrêt demandé | idem | idem |
| `stopped`, `done`, `failed` | Relancer, sauf R1 et R2 | rien | rien |

- **Admin d'org = `org_role === 'org_admin'` ou super_admin**, la parité de `roles.is_org_admin` :
  `isOrgAdmin` de `useMe` depuis oto#210, qui comptait jusque-là l'`admin` plateforme, que
  `launch` refuse. Un membre ne voit pas de bouton grisé : le geste est omis.
- **`droits` projette la règle commune des écrans d'org** (`canWriteInOrg`, `canAdministerOrg` de
  `useMe`, oto#211) : la colonne « lecture seule » est celle de tous les écrans `/org/*`.
- **R1** — `campagne_a_servir` compare `max_rows` à **tous** les travaux de la campagne
  (`jobs_total`) : relancée, elle resterait `armed` pour toujours.
- **R2** — `arreter_campagnes_epuisees` lit la série d'échecs sans borne d'armement : relancée,
  elle serait ré-arrêtée sans rien produire. Détecté par la **constante** que le serveur écrit,
  `stop_reason = 'max_consecutive_failures'`, jamais par une lecture du texte.
- Sur R1, R2 et un historique, le message nomme le levier : demander à l'agent de **déclarer
  une nouvelle campagne**. Jamais « augmenter la borne ». R1 et R2 disparaîtront quand le
  backend comptera depuis `armed_at`.
- **Témoin = relecture observée.** La réponse d'un geste (`armed`, `stopping`) est un fait écrit
  par le serveur : elle remonte à la section et s'affiche. `running` et `stopped` ne s'affichent
  que sur une relecture `op=state` qui les sert. Après le geste, relecture toutes les 5 s pendant
  60 s (armer, relancer) ou 2 min (arrêter), rien onglet caché, arrêt au démontage ; ensuite, le
  rythme de la page.
- **`stopping` peut durer** tant qu'aucun worker ne sonde : le message le dit, sans rouge, et
  dit que les travaux en vol continuent de dépenser.
- **Refus** : le `detail` du serveur mot pour mot, avec son code ; un 409 relit. Les codes ne sont
  pas typés : plusieurs manquent à tout OpenAPI (`model_key_required`, `org_admin_required`,
  `not_launchable`).
- **Rien d'autre ne se règle** : ni cible, ni modèle, ni `workers`, ni plafond ;
  `budget_max_tokens` n'est pas affiché ; le motif d'arrêt n'est pas saisi.
- ⚠️ **Une seule liste à clés** dans `CampaignsSection.vue` : une campagne relancée change de
  groupe, et deux listes démonteraient sa carte en pleine observation. ⚠️ Une campagne écrite
  par une carte n'est pas écrasée par une lecture de la liste partie avant (`fusionnerLecture`).

`lib/runnerGestes.spec.ts` tient la table. `automations/campaignActions.spec.ts` tient la garde
(ni « arrêtée » ni « en cours », en fr comme en en, avant la relecture qui les sert), sa
contre-épreuve par un mutant simulé en mémoire, la fenêtre d'observation, les refus et les droits.

## Régler un déclencheur (lot 2)

`automations/TriggerRow.vue` (une ligne et ses gestes) et `automations/TriggerSettingsForm.vue`
(le formulaire en ligne), sous `RunnerTriggersCard.vue`. La fiche d'une procédure
(`DoctrineView`) monte la **même** carte, donc les mêmes gestes.

- **Tout ce que le backend sert** : l'interrupteur, « Régler » (horaire cron avec son aperçu en
  mots, fuseau, modèle), « Supprimer » confirmé sur place.
- **Les droits reflètent le serveur servi** : `runner.triggers` est ouvert à tout membre, sans
  garde admin ni bêta, et l'écran n'en ajoute aucune. Seule la lecture seule masque les gestes.
  Réserver l'allumage et l'horaire à l'admin est une décision backend en attente : l'écran
  suivra ce que le serveur servira.
- **Seuls les champs modifiés partent** (`champsModifies`) : `op=update` est partiel, et un
  `model` renvoyé inchangé sur un déclencheur allumé repasserait la garde du modèle servi.
- **Le modèle** : « modèle du worker » (envoie `""`), puis les modèles `served` du catalogue
  (`runner.models`, servi avec la liste). Un modèle courant non servi reste affiché et marqué
  « non servi », sur la ligne et dans le formulaire. ⚠️ **Jamais de présélection du
  `default`** : sans modèle déclaré, le formulaire part de « modèle du worker ».
- **Le fuseau** : `Intl.supportedValuesOf('timeZone')`, le fuseau courant en tête s'il n'y
  figure pas. La validation reste au serveur : `invalid_schedule` (cron et fuseau revalidés
  ensemble) s'affiche sous l'horaire, avec le `detail` qui nomme le fautif, et la saisie reste.
- **Après succès**, la réponse fait foi (`next_due` recalculé par le serveur), puis la carte
  relit `op=list`. ⚠️ La réponse est la ligne **brute**, sans `expired_*` : ce que le
  déclencheur a perdu se garde de la lecture précédente (`apresReglage`), sinon le compte
  s'effacerait jusqu'à la relecture.
- **Suppression** : ses occurrences en attente ne partiront jamais (le serveur les périme avant
  de supprimer) ; la ligne ne part que sur `ok: true`.
- **Refus** de l'interrupteur, du formulaire et de la suppression : le `detail` du serveur mot
  pour mot, avec son code — jamais « 400 no_runner_armed » brut.

`automations/triggerRow.spec.ts` tient ces règles, montées dans la carte ;
`lib/runnerGestes.spec.ts` tient ce que le formulaire envoie.

## Ordre et repli des campagnes

Les **vivantes** (`armed`, `running`, `stopping`) d'abord, puis les **récentes** (un changement
d'état déclaré dans les 7 derniers jours : armement, démarrage, demande d'arrêt, arrêt,
création), puis un repli « N campagnes anciennes » à compteur vrai. Les cartes vivantes et
récentes s'ouvrent seules ; une carte repliée ne lit son `op=state` qu'à l'ouverture. Une
campagne sans aucune date lisible va au repli : on ne la prétend pas récente.

## Rafraîchissement

Avant oto#205, la file relisait les 120 derniers travaux toutes les 30 s, **onglet caché
compris** — 89 % des appels de la route. Désormais (`useRafraichissement`, dont le registre est
tenu par la vue d'espace depuis oto#214 : seules les sections de la **page montée** s'y
inscrivent) :

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
  `fleet_id IS NULL` : la page des exécutions les offre comme deux sources, chacune avec son
  total vrai, plutôt qu'un filtre reconstruit sur une fenêtre.
- **Pas de filtre de date** sur `jobs op=list`, et `expired` n'est pas un filtre servi (il l'est
  sur une ligne). Servis : `status`, `source`, `fleet_id`, `trigger_id` (depuis oto-backend
  v1.212.0), `limit` (200 au plus), `cursor`.
- **`fleets op=state` est refusé en consultation en lecture seule** (403 `view_as_read_only` :
  `state` n'est pas dans `_READ_OPS`), `op=get` passe. La page d'une campagne s'ouvre donc par
  `get`, et seuls ses compteurs disent le refus. Défaut serveur mesuré le 13/09, sans issue.
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
  l'affiche que dans le refus de relance R1 : « travaux produits : N sur M ».
  `automations.spec.ts` tient les deux silences sur une campagne en cours ;
  `campaignActions.spec.ts` tient le libellé de R1.
- **Programmation webhook (24/09/2026)** : l'écran la LIT (genre, adresse composée par le serveur,
  livraisons, file) et ne règle que son modèle et son interrupteur. Le secret ne se relit jamais
  (seuls `create` et `rotate_secret` le rendent) : il ne s'affiche donc pas. Créer un webhook,
  renouveler son secret (`rotate_secret`), vider sa file (`clear_queue`) et régler son lissage
  (`max_per_hour`, `freshness_seconds`, `payload_mode`) restent hors de l'écran. `outcome` d'une
  livraison est figé à la réception ; son `job_status` est relu, et `held` (retenu par la pause)
  a son libellé.
- **Pas de lecture d'un travail par run.** `jobs op=get` lit un travail par son **identifiant**,
  jamais par `run_id`. `?run=` cherche donc parmi les travaux `claimed` (une page, 200 au plus) :
  les liens ne partent que d'une ligne qu'un run tient, donc d'un travail en vol. Trouvé, il mène à
  la page de l'exécution ; hors de cette page, ou déjà conclu, l'entrée le dit.

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
  `/automations?run=<run>` pour une ligne tenue par un run ; `useCibleRun` le résout et l'entrée
  **remplace** l'adresse par `/automations/executions/<id>` (oto#214).
- **travail → ligne** : seulement pour un travail **en cours**, par la file de travail du tableau
  visé, adressé par **identifiant** (`payload.datastore_id`, oto#160). Sur un travail **conclu**,
  la ligne travaillée n'est plus retrouvable — `_claimed_run` dit sur quelle ligne un run est
  *maintenant*, jamais laquelle il a travaillée — et la fiche le dit au lieu de laisser un silence.

## Retiré par oto#214 (13/09/2026)

- **La section « Travaux hors campagne »** (`OffCampaignSection.vue`) : ses deux listes sont la
  page des exécutions sous `source=scheduled` et `source=manual`.
- **La fiche en fenêtre** : `RunnerJobDetail` est le corps de la page d'une exécution, que les
  listes ouvrent par un lien ; plus aucune fenêtre ne tient un travail.
- **L'événement `runner` de la carte des programmations** : l'entrée lit la présence elle-même.

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

`listRunnerFleets()` · `getRunnerFleet(id)` · `getRunnerFleetState(id)` · `launchRunnerFleet(id)` ·
`stopRunnerFleet(id)` · `listRunnerJobs(filtre, page)` · `getRunnerJob(id)` ·
`getRunThread(run_id)` · `getNamespaceQueue(id)` · `listRunnerTriggers(procedure?)` · `getRunnerTrigger(id)` ·
`updateRunnerTrigger(id, champs)` · `deleteRunnerTrigger(id)` · `listRunnerDeliveries(id)` · `getConnectorInstances()` — tous
dans `api/console.ts`.
`RunnerFleet`, `RunnerFleetState`, `RunnerArme` et `RunnerModel` sont **dérivés** du document OpenAPI
(`types/api.ts`) ; `RunnerJob` reste écrit à la main (contrat ouvert de `result`, statut `string`
parce que le serveur sert aussi `expired`), avec `lease_until` pris dans `types/api.attendu.ts`.
`RunnerTrigger` est dérivé du schéma `Trigger` depuis le 24/09/2026 (seuls `procedure`,
`enabled` et `tools` y sont resserrés) : la copie écrite à la main ignorait `kind`, et montrait
un webhook comme un horaire cron. `cron` et `tz` y sont nullables, parce qu'un webhook n'en a
pas. `RunnerDelivery` est dérivé de `Delivery`. Fixture de test partagée :
`views/console/automations/__tests__/programmation.ts`. Les codes de refus ne sont pas typés : plusieurs manquent à tout
OpenAPI, ils se lisent par l'enveloppe d'erreur générique.
