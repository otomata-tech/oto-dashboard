---
title: Datastore (front)
type: reference
description: >-
  Le groupe nav « memory » : la grille server-driven du datastore (tri/recherche/filtres par
   colonne, vue fiches aux mêmes verbes que la table, deeplink par id, ownership ADR 0030) e
  t la KB d'org devenue un projet.
---

# Mémoire — datastore + knowledge (ADR 0016)

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
- **Knowledge** — la base de connaissance d'org est un **projet** (zone Documents, `oto_kb`), atteignable via « Projets » ; `/console/knowledge` redirige vers `/documents`.

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

## Le pont de renommage `namespace` → `datastore` (TEMPORAIRE, 08/09/2026)

oto renomme le concept sur sa face REST en **bascule sèche** : aucune fenêtre où les deux
noms fonctionnent. Trois surfaces bougent, et deux d'entre elles **ne lèvent rien** — une
clé de réponse lue sous son ancien nom rend `undefined`, un code d'erreur renommé tombe
dans le cas par défaut. Elles **dégradent** au lieu d'échouer.

`api/console.ts` porte donc un pont, `servedName()` / `servedList()`, qui accepte les deux
noms et **lève quand aucun des deux n'est là**. C'était le point : avant, un `?? []` en
aval rendait une liste vide sur une clé disparue — écran blanc, aucune erreur, et les
gestes destructifs escamotés (leur affordance se lit sur les `can_write`/`can_govern` de
cette même liste) au lieu de mal tirer. Sûr, et invisible.

Le pont normalise **au bord** : en aval, types, composants et vues continuent de lire
`namespace`, le nom local. C'est ce qui confine ce lot à un fichier au lieu de douze.

⚠️ **Ce qui ne bouge PAS, et qu'il ne faut pas « corriger » par cohérence** : la valeur
`resource_type: "datastore_namespace"` (écrite en base, des partages de production en
dépendent), la portée `scopes.namespaces` d'un jeton (à l'émission comme à la lecture), et
tous les `namespaces` du **catalogue d'outils** — un connecteur expose des namespaces
d'outils, homonymes sans rapport avec un tableau. Corriger depuis la liste du renommage,
jamais depuis le mot.

**Le retrait est mécanique, pas mémoriel** : `lib/renameBridge.spec.ts` devient rouge dès
que le contrat commité ne déclare plus `/api/datastore/namespaces`, c'est-à-dire au premier
`npm run api:refresh` après la bascule. Il dit alors quoi retirer.
