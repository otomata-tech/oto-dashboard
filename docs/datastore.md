---
title: Datastore (front)
type: reference
description: >-
  Le groupe nav « memory » : la grille server-driven du datastore (tri/recherche/filtres par
   colonne, vue fiches aux mêmes verbes que la table, deeplink par id, ownership ADR 0030) e
  t les documents d'org, devenus un projet comme un autre.
---

# Mémoire — datastore + documents (ADR 0016)

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Les deux surfaces de mémoire

Groupe nav **« memory »** (`consoleNav.ts`) = deux surfaces de mémoire :
- **Datastore** (`/data`, `DataView.vue`) — stockage tabulaire, **substrat PG natif** (plus Google Sheets). Grille **server-driven** (`DataTable.vue` : tri 3 états/recherche/pagination/**filtres par colonne** côté API via `getNamespaceRows({offset,limit,order_by,order_dir,q,filters})` — ops par type dérivé `datastoreFilters.ts` (text/number/date/bool/**timestamp**), cellule `ColumnFilterCell.vue`, chips des filtres actifs retirables (`FilterChips.vue`, partagé avec la vue fiches), taille de page 25/50/100, header sticky ; rendu cellules typé `cellRender.ts`) ; clic row → détail/édition (`RowDrawer.vue`).
  > **Dates système triables ET filtrables (05/08).** « modifié le »/« créé le » (`_updated_at`/`_created_at`) sont des colonnes à part entière : filtre de date à leur en-tête (le filtre y était explicitement omis), « créé le » ajoutable par le sélecteur de colonnes, kind `timestamp` (pas d'op vide/rempli — la colonne est NOT NULL, le backend les refuse). Le type de filtre d'une colonne vient d'abord du **type déclaré au schéma**, sinon des valeurs de la page (une colonne vide sur la page ne retombe plus en `text`). ⚠️ Côté backend, le WHERE ne routait ces noms nulle part : cf. `oto-backend/docs/datastore.md` (une valeur `AAAA-MM-JJ` = la **journée entière**).
  > **La vue FICHES a les mêmes verbes que la table** (`DatastoreToolbar.vue`) : recherche, tri (champs du schéma + dates système) + sens, filtre sur la date de modification, chips. Elle est le DÉFAUT d'un namespace typé et n'offrait qu'un pager — basculer de présentation ne doit pas retirer de pouvoir. Même état (`?q/sort/dir/f`) que la table : ce qu'on filtre d'un côté reste filtré de l'autre. L'état vide appartient désormais à l'appelant (`DatastoreCards` ne l'affiche plus) — lui seul sait distinguer « filtré à zéro » (message actionnable) de « tableau encore vide ».
  > **Un champ déclaré sans rôle n'est plus muet en fiches.** Les rôles (`title`/`badge`/`metric`/`status`/`qualif`/`note`) ne le prenaient pas, et le pied de fiche ne reprenait QUE les champs **non** déclarés : déclarer un champ au schéma sans lui donner de rôle le faisait DISPARAÎTRE, alors que ne pas le déclarer du tout l'affichait. Le pied liste maintenant les déclarés-sans-rôle (ordre du schéma, sous leur libellé) puis les non déclarés (sous leur clé). `hidden: true` reste honoré — le champ vit dans la fiche détaillée (`formFields` rend tout le schéma). **Deeplink par id** (`?ns=<id>`, `NamespaceEntry.id` BIGSERIAL stable → le **renommage** ne casse pas l'URL) **+ état du tableau MIROIR dans l'URL** (`?q/sort/dir/page/ps/f`, `readTableQuery`/`syncTableQuery` — refresh et partage de lien conservent la vue filtrée ; `?f=` sérialisé par `filtersToParam`/`filtersFromParam`, param malformé ignoré). **Ownership ADR 0030** : les droits viennent du payload (`can_write`/`can_govern`/`owner_type`), plus de `isOwner` dérivé du flag `shared` ; read-only = `can_write===false`, boutons share/rename/transfer/delete gatés par `can_govern`. **org-owned activé** : la création propose un scope (perso / classeur d'org active) via `promptForm` select → `createNamespace(ns, {type:'org', id})` ; badge « org »/« team » sur la liste. **share** (`SharePrincipalDialog.vue`, dialog de partage unifié membre/équipe/org via `oto_resource` — aussi utilisé par projets et doctrines ; sélecteur de **rôle** lecteur/éditeur/**gérant** via `lib/resourceRole.ts`, ADR 0048 — le gérant a la gouvernance grantable), **rename**, **transfer** (l'ancien proprio repasse en grant write). Plus de gate Google.
  > **« Enregistrer comme vue par défaut » n'écrase plus ce qu'il ne nomme pas (06/09).** Le bouton reposait le schéma **entier** (`PUT …/schema`), reconstruit depuis les seuls champs que le front connaissait : `hidden` retiré de tous, reposé sur les décochés. Un aller-retour dans le menu « colonnes » rendait donc visibles, **pour tout le monde**, les `hidden` déclarés ailleurs — par un agent, ou sur une colonne absente de la page donc absente du menu (près de cinq cents colonnes en portaient un, surtout chez des clients). Le geste se cachait au milieu de gestes purement **locaux** : tous les autres réglages de ce menu sont un miroir d'URL. Il passe désormais par `PATCH …/schema` (`patchNamespaceSchema`, fusion par clé — oto-backend#388) et ne nomme QUE les colonnes de ce menu dont l'état change (`hiddenPatch`, `lib/datastoreColumns.ts`) : colonnes jamais vues, sous-champs, libellés et bornes ne sont pas dans le corps, donc ne peuvent plus être perdus. **Un seul appel, groupé** — une modification de schéma reconstruit un index sur la table que tous les tableaux partagent (interblocage du 05/09), en multiplier rejouerait la cause. Banc : `datastoreColumns.spec.ts` — il juge le résultat APRÈS la fusion serveur, et tient aussi les deux points d'appel (ni `PUT`, ni une portée plus large que le menu).
  > **La file de travail dit son PLAFOND et ses abandons (01/09).** Le serveur compte les réservations d'une ligne restées sans écriture (`_claims`) et, passé `lifecycle.max_claims`, la verse dans `lifecycle.abandon_state` avec un motif dans `_abandon` (oto-backend#433). Les trois surfaces l'ignoraient : la barre de statuts affichait l'état d'abandon comme un état métier ordinaire, la file de travail montrait « en cours · worker » sans dire que c'était la 3ᵉ fois, et `_abandon` n'apparaissait NULLE PART (la vue fiches écarte tout ce qui commence par `_`). Un opérateur ne voyait donc ni pourquoi une ligne était sortie de la file, ni combien de fois elle avait été tentée. Désormais : plafond annoncé par la barre de statuts (avec l'état d'abandon distingué), compteur `2/3` par ligne dans le bandeau de file + décompte des lignes **au plafond** (celles qu'une libération sans écriture sortira de la file — le seul moment où un humain peut encore agir, le serveur épargnant les baux actifs), motif rendu **tel quel** en fiche et en vue fiches, et bandeau de réparation dans le drawer. `lib/datastoreClaims.ts` est un **miroir du serveur** au même titre que `keyStack.ts` : ⚠️ le motif **cite ses chiffres** parce que le plafond a pu changer depuis — le reformuler ou le recalculer côté écran ferait mentir la fiche (le serveur ne fait même pas l'accord au singulier, on ne le corrige pas non plus). ⚠️ **Une écriture rouvre la file, pas forcément le statut** : la plateforme verse la ligne dans l'état d'abandon sans s'autoriser à l'en sortir, donc sans transition de retour déclarée un changement de statut est REFUSÉ — le bandeau le dit plutôt que d'offrir un bouton voué au 400. Les lignes abandonnées ne sont pas dans `/queue` (l'abandon annule le bail) et aucun endpoint ne les liste : on les atteint par le filtre de statut sur l'état d'abandon.
- **Documents** — les documents d'une org vivent dans un **projet d'org ordinaire** (zone
  Documents), atteignable via « Projets ». Le serveur l'ancre par id (`POST /api/me/kb`,
  `getKbProject`) : le chemin et le nom de fonction sont des identifiants d'API **hérités**,
  la règle maison voulant que le code garde son nom quand seule la copy change.
  > **Le modèle « base de connaissance » n'existe plus (11/09/2026).** Le concept a été
  > retiré côté plateforme (backend `v1.257.0`, verbe MCP `oto_kb` retiré) ; il ne restait
  > ici que des textes — l'étape d'accueil dans les deux langues, la ligne d'attente de
  > `DocumentsView`, une puce du catalogue de facturation. Réécrits sur le modèle courant
  > (**projets** et **documents**). Le retour du vocabulaire est refusé par
  > `lib/vocabulaire.tripwire.spec.ts`, qui parcourt `index.html` + tout `.vue`/`.ts`/`.json`
  > de `src/`, commentaires retirés, et laisse délibérément passer le jeton `KB` (ambigu :
  > `Ko`, « si KO ») comme `zero-knowledge` (ADR 0032, autre sens).
  > **L'adresse `/knowledge` reste** et redirige vers `/documents` : elle a été distribuée,
  > elle doit continuer de résoudre. Le même tripwire l'exige positivement.
  > Contrôle sur le bundle **servi** (la source ne prouve pas le déployé) :
  > ```bash
  > # récursif sur le MOTIF de nom : les imports sont relatifs, grep '/assets/' sur
  > # index.html seul rend un zéro faux (~10 fichiers au lieu de ~250).
  > for a in $(curl -sS https://manage.oto.ninja/ | grep -oE '[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{6,}\.js'); do curl -sS "https://manage.oto.ninja/assets/$a"; done | grep -oi 'connaissance\|knowledge'
  > ```
  > La seule occurrence attendue est `knowledge` dans `{path:"/knowledge"…}` — la
  > redirection. Toute autre est un retour du vocabulaire.

## Ce que la liste de `/data` montre — deux listes, trois sections, aucune fusion

`GET /api/datastores` est scopée par l'**org de consultation** (en-tête `X-Oto-Org`) et
exclut **à dessein** les droits nominatifs (`principal_type='user'`) : un partage à une
personne n'appartient à aucune org, l'y faire entrer le ferait lire comme un tableau de
celle où l'on navigue — c'est l'incident du 30/06/2026, et cette décision tient.

Le défaut n'était donc pas là, il était qu'**aucune autre porte ne les rendait** : partage
réussi, contenu lisible, tableau introuvable. `GET /api/me/datastores/shared` (backend
v1.255.0, `SUB_ONLY`, arbitrage d'Alexis sur oto#160 du 10/09/2026) est cette porte — même
forme d'entrée, plus `shared_by`, et elle répond quelle que soit l'org active.

La vue en tire **trois sections** (`groupes` dans `DataView.vue`, des données, pas des
blocs de gabarit) : la liste de l'org en tête, puis `personnel`, puis `partagé avec moi`.
Les deux dernières sont repliées **dans** une org et dépliées hors org — c'est le contexte
d'org qui décide du repli, jamais la nature du contenu.

- **Aucun doublon**, deux fois : le serveur écarte ce que la liste de l'org rend déjà (jeu
  dérivé de `list_datastores()`, jamais recopié), et la vue le refait sur les ids
  réellement rendus — elle compose deux réponses obtenues à deux instants, entre lesquels
  un partage nominatif peut avoir été élargi à l'org.
- **Le lien direct résout sur l'UNION** des deux listes. C'est le point qui a motivé
  l'arbitrage : `/data/<id d'un reçu>` jetait l'id en silence et rendait l'écran de
  « rien de sélectionné ». Corollaire : la carte « tableau introuvable ici » n'accuse plus
  le partage nominatif — ce serait envoyer le destinataire réclamer ce qu'il a déjà.
- **L'homonymie est fermée (10/09/2026) : l'écran adresse par l'IDENTIFIANT.**
  `DatastoreTable` désignait le tableau par son **nom** (`meta.datastore`) pour toutes
  ses routes, et `resolve_datastore_ns` préfère, à nom égal, le tableau **personnel du
  demandeur** (`ORDER BY CASE WHEN d.namespace = %(ns)s THEN 0 ELSE 1 END, CASE WHEN
  owner_type='user' AND owner_id=%(sub)s THEN 0 …`). Ouvrir un tableau **reçu** homonyme
  d'un des siens peignait donc les lignes du sien, **sous le bon libellé et sans un mot** —
  une réponse plausible et fausse, pire qu'une erreur.

  La désignation est désormais `dsRef` (`String(meta.id)`), à côté de `name` resté le
  **libellé**. Seize points de désignation basculés — quatorze dans `DatastoreTable`
  (treize appels REST + le `ns` que `useTransitionUndo` garde pour rejouer l'annulation)
  et les deux props `:datastore` des enfants qui appellent le serveur eux-mêmes
  (`DatastoreActivity` → `…/activity`, `RowDrawer` → `…/rows/{id}/activity`) — plus deux
  dans `ProjectWorkQueues`, qui portait le même défaut sur les files d'un projet.
  ⚠️ Le prédicat de visibilité est **identique** par id et par nom (aucun IDOR : un id
  hors de la portée de l'acteur ne résout pas) — c'est ce qui rend la bascule sûre, et
  c'est mesuré au tag backend `v1.256.0`, route par route : les treize résolvent par
  `_resolve` → `resolve_datastore_ns`, et **suppression comme renommage opèrent en base
  par `id`** (`delete_datastore_by_id` / `rename_datastore_by_id`), jamais par un
  `WHERE namespace = <segment>`. Aucune garde ne refuse un segment numérique. Le backend
  pousse d'ailleurs l'id dans toutes ses réponses (`ns_id`, `datastore/identite.py`) en
  annonçant le numéro comme *la* forme à passer.

  ⚠️ **Ce qui garde le nom, et ne doit pas basculer** : le titre de la carte, le nom du
  fichier exporté, la phrase de confirmation de suppression, le doublon écarté par le
  renommage (`next === name.value` — c'est un nom que l'utilisateur tape), et l'exemple
  `data_write("<nom>", row)` de l'état vide. **Les ROUTES du navigateur non plus ne
  bougent pas** : `nsRef` est ce que l'appelant passe (`/data/<id>` côté Données,
  `/projects/:id/data/:ns` côté projet, qui porte souvent le nom) — l'adresse reste
  lisible, et le lien direct d'un tableau reçu résout comme en v1.66.0.

  Banc : `components/console/datastoreHomonymie.spec.ts`. Il monte l'écran sur un tableau
  reçu, avec un serveur factice qui **rejoue le tri de `resolve_datastore_ns`** — c'est la
  reproduction, et elle peignait `MON-CLIENT-A-MOI` avant le correctif. Le montage
  n'exerce que six routes de lecture ; le témoin de source qui l'accompagne couvre les
  seize points, y compris ceux qu'aucun montage n'atteint (écriture, renommage,
  suppression, export, patch de schéma). Remettre le nom à **un seul** d'entre eux rougit
  le fichier — vérifié sur cinq d'entre eux, dont un site jamais monté et une forme sans
  variable intermédiaire.

  ⚠️ **Les deux derniers endroits sont fermés (11/09/2026), et par le SERVEUR.** Ils
  lisaient un nom sans numéro à côté — et les corriger à l'écran, en résolvant ce nom
  vers un id, aurait refait le bug : la résolution qu'un écran peut faire est celle de
  SON lecteur, et c'est elle qui est ambiguë. Le backend porte donc l'identifiant
  jusqu'à eux :

  - **le détail d'un travail de runner** (`RunnerJobDetail`) lisait `payload.namespace`.
    La charge utile emporte désormais `payload.datastore_id`, résolu à l'enfilage **au
    nom de qui a déclaré la campagne** (backend `v1.262.0`, `capabilities/runner_jobs.py`
    — le nom reste servi à côté, sous `namespace`). L'écran
    sépare les deux : `tableauNom` est le LIBELLÉ, `tableauId` l'ADRESSE — file de
    travail, lien d'ouverture et liens de ligne partent tous du second.
    ⚠️ **Un travail est PERSISTÉ** : ceux enfilés avant ce jour n'ont pas d'identifiant
    et n'en auront jamais. L'écran ne lit alors **aucune** file (la lire par le nom
    lirait celle d'un autre tableau) et n'offre **aucun** lien, quel que soit le statut du
    travail — le lien se garde sur l'identifiant, pas sur le statut : il montre le nom et dit
    pourquoi il s'arrête là — « ce travail nomme son tableau sans l'identifier ». Un
    quatrième état de `tenue`, `sans-adresse`, porte ce cas ; afficher le nom sans
    prétendre l'ouvrir vaut mieux qu'ouvrir le mauvais.
  - **le repli de `resolveMeta`** (aucun `nsMeta` passé — les embeds de projet) cherchait
    dans `getNamespaces()` seule, qui exclut à dessein les reçus nominatifs : un tableau
    REÇU y était introuvable et l'écran répondait « introuvable dans ce contexte » sur un
    tableau parfaitement lisible. Il consulte maintenant **les deux listes**
    (`getNamespaces()` + `getSharedWithMe()`, jamais fusionnées en amont), et il cherche
    **l'identifiant d'abord, le nom ensuite** — chercher les deux clés dans la même passe
    laissait l'ordre de la liste trancher, donc un homonyme à soi gagner sur l'id demandé.
  - **le lien de projet** ne portait qu'un nom quand un agent l'avait posé (#117).
    `ProjectLink.datastore_id` (backend `v1.262.0`, `db.list_project_links`, servi par
    `oto_project op=get` tel quel — résolu dans la portée du
    **propriétaire du projet** — donc identique pour tous les lecteurs) est ce que
    `ProjectViewer` passe en `ns-ref`. **Sans cette clé, l'embed ne se monte pas** : le
    serveur dit qu'il ne sait pas lequel désigner, on ne le devine pas à sa place.

  Banc : `components/console/homonymieDesignationServeur.spec.ts`. Il monte les VRAIS
  écrans — `RunnerJobDetail`, `DatastoreTable` sans méta, et `ProjectViewer` sur un lien
  posé par nom — contre le même serveur factice qui rejoue le tri de
  `resolve_datastore_ns`. Rejoué sur le code d'avant, il reproduit les deux défauts : le
  lien « ouvrir la ligne qu'il tient » valait `/data/clients/item/file41`, une ligne du
  tableau DU LECTEUR ; le lien de projet peignait `MON-CLIENT-A-MOI` sous « clients » ; un
  reçu adressé par id tombait en « introuvable ». Six preuves de chute vérifiées : la file
  de travail lue par le nom, le lien d'ouverture bâti sur le nom, les liens gardés sur le
  nom plutôt que sur l'id, l'embed de projet sur `target_ref`, le repli privé de la seconde
  liste, id et nom refondus dans une même passe — chacune rougit.

- **Les files de travail d'un projet sont fermées (11/09/2026) — la dernière surface
  où l'écran transformait une désignation servie en nom.** `ProjectDetailView` projetait
  les liens `tableau` en NOMS (`l.datastore ?? l.target_ref`) et `ProjectWorkQueues` les
  rapprochait de `getNamespaces()`. Il adressait bien le serveur par un id — mais l'id
  d'une entrée **choisie par le nom** : l'adresse était juste, le choix ne l'était pas.
  Rejoué sur ce code, un lecteur qui possède un `clients` et ouvre un projet lié à un
  autre `clients` voyait « clients 3 · a_faire 3 · fait 0 · 1 sous bail », avec un
  lien vers `/data/41` (le sien). Le tableau du projet en porte 24 et deux baux.

  Le bloc reçoit maintenant les liens ENTIERS (`:table-links="linksOf('tableau')"`) et
  choisit ses tableaux par `datastore_id`, dans **les deux listes** (comme le repli de
  `DatastoreTable` : sinon un tableau reçu lié au projet n'avait jamais de compteurs). Le
  libellé reste le nom. **Un lien sans `datastore_id` est nommé, sans compteurs ni lien**,
  avec la phrase de la vue du lien (« aucun tableau résolu pour ce lien — relie-le à
  nouveau… ») ; il n'est pas résolu à l'écran, et le bloc s'affiche pour le dire même
  quand aucune file n'est comptée. Un `datastore_id` absent des deux listes du lecteur
  (tableau qu'il ne peut pas lire) est tu, comme avant : c'est un refus d'accès, pas un
  défaut du lien — `DatastoreTable` dit « introuvable » sur la vue du même lien.

  Banc : `components/console/filesDeProjetHomonymie.spec.ts` — il monte `ProjectViewer`
  sur l'accueil, contre le serveur factice qui rejoue le tri de `resolve_datastore_ns`,
  avec une population témoin (un lien vers MON tableau doit compter le mien, sinon un
  bloc qui ne montrerait jamais 41 passerait). Trois preuves de chute, comptes prédits
  avant de lancer et obtenus : le nom remis comme **critère de choix** rougit 5 tests
  sur 6, le nom remis comme **adresse** 4 sur 6, la projection par nom remise dans la page
  1 sur 6 (le témoin de source — la page n'est pas montée).

  ⚠️ **Ce qui reste, et pourquoi — plus aucune désignation SERVIE ne repart en nom.**
  Les trois endroits où un nom peut encore atteindre une résolution sont des adresses
  qu'une PERSONNE ou un agent a écrites, pas des désignations que l'écran fabrique :
  - l'**embed de page** (le bloc `oto-data`) est du texte libre : un nom tapé là se résout
    chez le lecteur, c'est la nature d'un nom ; un id tapé là résout, y compris sur un reçu ;
  - une **URL `/data/<nom>`** tapée ou collée : `DataView` la résout dans les listes du
    lecteur puis la normalise en `/data/<id>`. Le dashboard n'en fabrique plus (la
    recherche, les files, le runner et le `url` servi par le backend portent l'id).
    Résidu connu : `applySelection` cherche l'id et le nom dans la même passe — un tableau
    dont le NOM serait le numéro d'un autre pourrait gagner ;
  - `/projects/:id/data/:nsRef` ne désigne pas un tableau mais un **lien du projet**
    (`selectFromRoute` cherche dans les liens du projet, jamais dans les tableaux du
    lecteur) ; ce qui part au serveur est ensuite le `datastore_id` du lien.

- Le **snapshot OpenAPI commité ne connaît pas encore cette route** : son type est écrit à
  la main dans `types/api.ts` (pas dans `api.attendu.ts`, réservé à ce qu'une PR backend
  **ouverte** sert). `api:refresh` la ramènerait — avec toute la dérive accumulée.

## La file de travail d'un tableau, et le run qui tient une ligne

Le bandeau de supervision (`DatastoreQueueBar.vue`, ADR 0046 D) liste les lignes **sous
bail** : qui les tient (`_claimed_by`), jusqu'à quand (`_claimed_until`), et la libération
FORCÉE (humaine, sans garde de worker). Même bail sur la fiche (`RowDrawer.vue`) et au
grain projet (`project/ProjectWorkQueues.vue`).

**Depuis le 2026-09-01 il dit aussi POUR QUEL RUN** (`_claimed_run`, oto-backend PR #723).
Avant, il disait qu'un agent tenait une ligne — jamais **lequel tenait laquelle**, donc
sans moyen d'aller voir ce qu'il faisait. Le run est désormais un lien vers
`/automations?run=<run>`, que la file d'exécution consomme pour ouvrir le travail
correspondant (et qui **dit** que le run est hors fenêtre s'il est plus vieux que les N
derniers travaux, plutôt que de s'ouvrir sur rien).

⚠️ **Trois états, qui ne se confondent pas** — la lecture est dans `lib/bailDeLigne.ts` :

| ce qu'on lit | ce que ça veut dire |
|---|---|
| `_claimed_run: "<run>"` | ce run tient la ligne — on peut ouvrir son travail |
| `_claimed_run: null` | bail pris **sans run** : une personne sur la file du dashboard, ou un agent qui n'a pas passé son `_run_id`. **Un fait, pas un trou** — le dire « inconnu » laisserait croire à une donnée perdue |
| clé absente | aucun bail |

⚠️ **Le run ne se lit QUE sous bail.** `datastore_release` n'efface pas `claimed_run` côté
serveur (oto-backend #664) : la colonne peut rester garnie sur une ligne **libre**. La
projection ne la sert que sous `claimed_by IS NOT NULL`, et `bailLigne` tient la même
règle — sans quoi une ligne rendue pointerait vers un run qui ne la tient plus.

⚠️ **La fin de bail se lit par `bailLigne`, jamais par `Date.parse`.** Les horodatages
arrivent en UTC **sans fuseau** : un parse naïf les prend pour de l'heure locale, deux
heures d'écart l'été, et des baux annoncés expirés à tort. `ProjectWorkQueues.vue` portait
ce bug jusqu'au 2026-09-01.

## Le renommage `namespace` → `datastore` — le pont est RETIRÉ (10/09/2026)

oto a renommé le concept sur sa face REST en **bascule sèche** : aucune fenêtre où les
deux noms fonctionnent. Le dashboard a porté un pont deux jours (`servedName()` /
`servedList()` dans `api/console.ts`, 08/09 → 10/09). **Il n'existe plus.** Types,
composants et vues lisent `datastore` de bout en bout.

**Pourquoi le retirer si tôt.** Le pont normalisait au bord : en aval, tout continuait de
lire `namespace`, le nom local. Ça confinait le lot à un fichier — c'était son mérite, et
c'est devenu son défaut. Un pont qu'on ne retire pas devient une seconde API, et une
seconde API masque le renommage suivant. Côté oto, le doublon a été retiré le même jour
pour la même raison : trois surfaces y appliquaient trois politiques différentes (la liste
basculée à sec, les réponses unitaires doublées, l'upload jamais basculé), et l'incohérence
coûtait plus cher que la rupture.

⚠️ **Ce qui a survécu au retrait, et qu'il ne faut pas jeter avec le pont : la garde.**
`listeServie()` LÈVE quand la réponse ne porte pas la clé attendue. Ce n'était pas le pont,
c'était le point. Avant lui, un `?? []` en aval rendait une liste vide sur une clé disparue
— écran blanc, aucune erreur, et les gestes destructifs escamotés (leur affordance se lit
sur les `can_write`/`can_govern` de cette même liste) au lieu de mal tirer. Sûr, et
invisible : le pire des deux. C'est la seule protection qui vaille contre le mode d'échec
propre à ce renommage, où **rien ne lève** : une clé de réponse disparue rend `undefined`,
sans erreur et sans journal.

⚠️ **Ce qui ne bouge PAS, et qu'il ne faut pas « corriger » par cohérence** : la valeur
`resource_type: "datastore_namespace"` (écrite en base, des partages de production en
dépendent), la portée `scopes.namespaces` d'un jeton (à l'émission comme à la lecture), et
tous les `namespaces` du **catalogue d'outils** — un connecteur expose des namespaces
d'outils, homonymes sans rapport avec un tableau. Corriger depuis la liste du renommage,
jamais depuis le mot.

**Les CHEMINS ont basculé le 09/09/2026** — `api/console.ts` appelle
`/api/datastores/{datastore}/…`. ⚠️ **Le nom du paramètre change avec le préfixe** : sur les
chemins il ne se voit pas (la valeur voyage dans l'URL), mais la **création** porte le nom
du tableau dans son CORPS — `{ datastore: … }`. Un corps resté à l'ancien nom ne casse pas :
il crée un tableau **sans nom**, refusé en 400 `missing_datastore`.

### Deux calendriers désormais séparés

Ils étaient liés, et c'est ce lien que la décision du 10/09 a coupé :

| ce qui bascule | quand | ce qu'on voit si on se trompe |
| --- | --- | --- |
| les **clés de réponse** (`namespace` → `datastore`) | **fait, 10/09/2026** | rien — `undefined`, sans erreur ni journal |
| les **alias de CHEMIN** (`/api/datastore/namespaces` → `/api/datastores`) | 08/11/2026 | un 308, puis un 404 — ça se voit |

`lib/renameBridge.spec.ts` tenait le retrait du pont en surveillant la disparition des
alias de chemin. Ce témoin est **supprimé** : son déclencheur n'était plus le bon, et un
témoin qui ne peut plus sonner au bon moment vaut moins que rien — il rassure.

### ⚠️ Le front partenaire porte encore SON pont

`Tulina-team/tulina-app-front` (prévenir Julien) porte le même pont, et oto ne sert plus
l'ancien nom : **son pont ne le protège plus, il le fait seulement échouer en silence**.
À retirer chez lui, la liste étant celle que portait notre témoin avant sa suppression :

- `servedName` / `servedList` dans `src/lib/datastore-api.ts` ;
- les codes doublés dans `datastore-cell.tsx` et `datastore-table.tsx` ;
- les trois `case` doublés dans `components/datastore/activity-feed.tsx`.

Un contrôle posé chez lui engagerait son dépôt : ce préavis se porte donc à la main, par
un message, pas par un test. C'est le prix de la bascule sèche, et il était connu quand
elle a été décidée.
