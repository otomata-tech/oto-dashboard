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
- **Datastore** (`/console/data`, `DataView.vue`) — stockage tabulaire, **substrat PG natif** (plus Google Sheets). Grille **server-driven** (`DataTable.vue` : tri 3 états/recherche/pagination/**filtres par colonne** côté API via `getNamespaceRows({offset,limit,order_by,order_dir,q,filters})` — ops par type dérivé `datastoreFilters.ts` (text/number/date/bool/**timestamp**), cellule `ColumnFilterCell.vue`, chips des filtres actifs retirables (`FilterChips.vue`, partagé avec la vue fiches), taille de page 25/50/100, header sticky ; rendu cellules typé `cellRender.ts`) ; clic row → détail/édition (`RowDrawer.vue`).
  > **Dates système triables ET filtrables (05/08).** « modifié le »/« créé le » (`_updated_at`/`_created_at`) sont des colonnes à part entière : filtre de date à leur en-tête (le filtre y était explicitement omis), « créé le » ajoutable par le sélecteur de colonnes, kind `timestamp` (pas d'op vide/rempli — la colonne est NOT NULL, le backend les refuse). Le type de filtre d'une colonne vient d'abord du **type déclaré au schéma**, sinon des valeurs de la page (une colonne vide sur la page ne retombe plus en `text`). ⚠️ Côté backend, le WHERE ne routait ces noms nulle part : cf. `oto-backend/docs/datastore.md` (une valeur `AAAA-MM-JJ` = la **journée entière**).
  > **La vue FICHES a les mêmes verbes que la table** (`DatastoreToolbar.vue`) : recherche, tri (champs du schéma + dates système) + sens, filtre sur la date de modification, chips. Elle est le DÉFAUT d'un namespace typé et n'offrait qu'un pager — basculer de présentation ne doit pas retirer de pouvoir. Même état (`?q/sort/dir/f`) que la table : ce qu'on filtre d'un côté reste filtré de l'autre. L'état vide appartient désormais à l'appelant (`DatastoreCards` ne l'affiche plus) — lui seul sait distinguer « filtré à zéro » (message actionnable) de « tableau encore vide ».
  > **Un champ déclaré sans rôle n'est plus muet en fiches.** Les rôles (`title`/`badge`/`metric`/`status`/`qualif`/`note`) ne le prenaient pas, et le pied de fiche ne reprenait QUE les champs **non** déclarés : déclarer un champ au schéma sans lui donner de rôle le faisait DISPARAÎTRE, alors que ne pas le déclarer du tout l'affichait. Le pied liste maintenant les déclarés-sans-rôle (ordre du schéma, sous leur libellé) puis les non déclarés (sous leur clé). `hidden: true` reste honoré — le champ vit dans la fiche détaillée (`formFields` rend tout le schéma). **Deeplink par id** (`?ns=<id>`, `NamespaceEntry.id` BIGSERIAL stable → le **renommage** ne casse pas l'URL) **+ état du tableau MIROIR dans l'URL** (`?q/sort/dir/page/ps/f`, `readTableQuery`/`syncTableQuery` — refresh et partage de lien conservent la vue filtrée ; `?f=` sérialisé par `filtersToParam`/`filtersFromParam`, param malformé ignoré). **Ownership ADR 0030** : les droits viennent du payload (`can_write`/`can_govern`/`owner_type`), plus de `isOwner` dérivé du flag `shared` ; read-only = `can_write===false`, boutons share/rename/transfer/delete gatés par `can_govern`. **org-owned activé** : la création propose un scope (perso / classeur d'org active) via `promptForm` select → `createNamespace(ns, {type:'org', id})` ; badge « org »/« team » sur la liste. **share** (`SharePrincipalDialog.vue`, dialog de partage unifié membre/équipe/org via `oto_resource` — aussi utilisé par projets et doctrines ; sélecteur de **rôle** lecteur/éditeur/**gérant** via `lib/resourceRole.ts`, ADR 0048 — le gérant a la gouvernance grantable), **rename**, **transfer** (l'ancien proprio repasse en grant write). Plus de gate Google.
- **Knowledge** — la base de connaissance d'org est un **projet** (zone Documents, `oto_kb`), atteignable via « Projets » ; `/console/knowledge` redirige vers `/documents`.
