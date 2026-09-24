---
title: Projets (front)
type: reference
description: >-
  L'index grille et la page dédiée `/projects/:id` : brief, pages markdown arborescentes, en
  tités liées, partage/transfert, journal. Plus les slots et l'inventaire dérivé (ADR 0035) 
  et le partage navigable `<slug>.share.oto.cx`.
---

# Projets (couche d'organisation, ADR 0030)

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Les écrans

Groupe nav **workspace** → `/projects` (`ProjectsView.vue`, **index grille**) + page dédiée
**`/projects/:id`** (`ProjectDetailView.vue`, route résolue par `ConsoleLayout` via
`route.name==='project-detail'`, `viewKey=fullPath` → remount sur `:id`, même patron que
`admin-user`). Un projet = brief (point d'entrée) + **pages markdown arborescentes**
(`ProjectDocs.vue`, capacité `oto_doc`) + **entités liées** (tableau/procédure/connecteur/base,
picker des vraies entités via `getNamespaces`/`getConnectors`/`getDoctrine`)
+ **partage/transfert** (`oto_resource` resource_type=`project`, réutilise `getResource`/
`shareResource`/`transferResource`) + **journal d'activité**. API client : `*Project*`/`*Doc*`
dans `api/console.ts` (POST op-aware `/api/me/{projects,docs}`). Backend : `oto-backend/CLAUDE.md`
§Projet. Non faits : MCP-App rendu, édition temps réel, pré-set vendable.

**Une page se lit et s'écrit en place** (24/09/2026, repris du front de JB). En-tête de page
(`project/DocPageHead.vue`) : fil d'Ariane (le projet puis les pages parentes, cliquables),
titre **renommable en place** (clic, Entrée), chapô, « modifié le … » et l'état de
l'enregistrement. Le « par qui » manque : une page ne sert pas son dernier auteur (oto#274).
Le corps s'affiche **rendu** (diagrammes, liens `[[…]]`, tableaux intégrés) ; **un clic dans
la prose l'ouvre à l'écriture, curseur à l'endroit cliqué** (retrouvé par le texte du bloc,
pas par les coordonnées), sans bouton « éditer » ni « enregistrer ». Sortir du texte (focus
ailleurs, Échap) enregistre et rend la page. Enregistrement automatique
(`composables/useDocAutosave.ts`) après **4 s d'inactivité**, avec `expected_rev` : un 409
`conflict` n'écrase rien, l'écran le dit et propose de recharger ; un échec garde le texte à
l'écran et reste en écriture. ⚠️ 4 s et pas 1 s : chaque écriture crée une VERSION, réindexe
la page et recalcule ses rétroliens ; descendre plus bas attend le regroupement des versions
d'un même auteur côté backend (oto#274). Le brief du projet garde son bouton « éditer ». Pas
d'éditeur de blocs : le stockage reste `body_md`, les blocs relèvent du modèle nœuds (gelé).

**L'arbre de la barre latérale descend aux pages** (23/09/2026, repris du rail d'oto-frontend
quand le dashboard est resté le front du produit — `components/console/SidebarProjectTree.vue`).
Sous chaque espace (`SidebarSpaces`), un projet se déplie jusqu'à ses **pages** (arborescence,
profondeur affichée bornée à trois) et ses **tableaux liés** ; le projet affiché est déplié
d'office. Un clic ouvre l'objet **dans l'écran projet** (`?doc=<id>`, `/data/<ref>`) : pas de
fiche à part, décision d'Alexis. Deux gestes, ceux du rail d'origine : « + » crée une page
« Sans titre » au premier niveau et l'ouvre ; le crayon renomme une page sur place (Entrée
enregistre, Échap abandonne). Offerts si le projet est en écriture (`can_write`) **et** hors
consultation (`canWriteInOrg`). L'arbre et l'écran projet montrent les mêmes pages et
s'avertissent l'un l'autre par `lib/docsSignal.ts` (un compteur par projet ; chacun ignore le
numéro qu'il vient d'émettre) : sans ce signal, une page créée d'un côté manquait de l'autre.
Tests : `SidebarProjectTree.spec.ts`, `lib/docsSignal.spec.ts`.

**Ce que l'index d'une org range, et où** (21/09/2026 — `lib/projectVisibility.ts`,
`projectBucket`, test `lib/projectVisibility.spec.ts`). Les sections suivent le
propriétaire rapporté au contexte CONSULTÉ (`me.active_org`, lu sous l'en-tête de
consultation) : mes projets, les équipes, l'org, puis **« Partagés avec cette organisation »**
(`shared` : une autre org ou une autre personne l'a partagé à l'org ou à une de mes équipes
en elle — il se lisait comme un projet de l'org consultée), puis la bibliothèque. Un projet
partagé à **moi en personne** n'est dans la liste d'aucune org (règle backend) : il arrive
par `listProjects('me')` dans sa propre section « Partagés avec moi ». Un projet reçu se dit
reçu (`projectVisibility(…, { received })`) : jamais « visible par tous les membres de
<org consultée> » d'un projet qui appartient à une autre. En dessous, les **pages partagées
seules** (`listSharedDocs('org' | 'me')`, `oto_doc op=shared_with_me scope=…`) : le clic
ouvre la page par son id dans un lecteur (`getDoc`), car le lecteur n'a souvent QUE la page
(son projet lui est fermé, `url` vaut null) ; avec l'accès au projet (`url` posée), le lecteur
propose de l'ouvrir dans son projet.

**L'adresse désigne l'objet affiché, jamais un autre** (oto#203, 13/09/2026 —
`composables/useProjectTarget.ts`, règle commune `lib/routeTarget.ts`). Deux adresses portent
une sélection : `?doc=<id>` (une page) et `/projects/:id/data/:nsRef` (un tableau lié). Avant,
une adresse qui ne résolvait rien laissait la sélection intacte : l'accueil (le brief) au
montage, l'objet PRÉCÉDENT en navigation. Désormais :
- **page listée** → ouverte depuis la liste ; **id hors liste** → `oto_doc op=get` : une page
  de ce projet s'affiche (liste en retard ou non chargée), celle d'un **autre projet** se nomme
  avec le lien vers son projet, un **refus** s'affiche avec son code ; pas un id → introuvable,
  sans appel ;
- **tableau** → le lien du projet par `target_ref`, puis `datastore_id`, puis le nom ; un nom
  porté par plusieurs liens **liste les candidats** sans en ouvrir aucun ;
- ouvrir une page (rail, backlink, création) lui donne SA propre adresse ; supprimer la page
  affichée retire `?doc=`. Connecteurs, procédures et fichiers n'ont pas d'adresse : ils
  quittent celle d'une page ou d'un tableau.

Tests : `views/console/ProjectDetailView.spec.ts`. ⚠️ Une page de ce projet lue hors liste
disparaît au prochain rechargement des pages (le repli « page disparue » la traite comme
supprimée).

## Slots & inventaire dérivé (ADR 0035, B4/B5)

> **Slots & inventaire dérivé (ADR 0035, B4/B5).** Le formulaire « publier en endpoint MCP »
> **préremplit** ses outils depuis l'inventaire dérivé (`getProjectInventory` = op `inventory` :
> refs `<tool:>` des procédures liées ∪ outils des runs) quand le projet n'a pas de liste curée —
> on cure, on ne retape pas. La même réponse porte l'**`audit`** (liens morts / slots de procédure
> non bindés / procédures inertes) → bandeau « liens à vérifier » de `ProjectDetailView`,
> rechargé après lier/délier. Un lien peut porter un **`slot`** (binding nommé, 409 `slot_taken`).

## Partage NAVIGABLE d'un projet (ADR 0032) — `<slug>.share.oto.cx`

> **Partage NAVIGABLE d'un projet (ADR 0032) — `<slug>.share.oto.cx`.** `ProjectDetailView`
> porte la carte « Endpoint MCP & partage » : pour un projet publié en `secret`, elle affiche
> le **lien de partage navigable** `https://<slug>.share.oto.cx` (dérivé côté front de
> `mcp_slug`/`mcp_access`, aucun secret) + l'endpoint connecteur `…/mcp`. Les invités y naviguent
> les procédures/tableaux/docs en **lecture seule**, rendus **server-side** par le backend
> (`share_ui`) — rien à faire côté front (pas de viewer SPA). Le backend expose aussi `share_url`/
> `mcp_url` (per-mode) sur `oto_project(op=get)`.
> **`/import` RETIRÉ (12/09/2026, oto#192 : aucun usage en 45 jours)** — `ImportProjectView.vue`
> et `importSharedProject` sont partis du dashboard ; un lien `/import?slug=` retombe sur l'accueil
> (route attrape-tout). ⚠️ Le CTA de la page publique vit côté backend (`share_ui`) et pointe
> toujours vers cette route : c'est à retirer là-bas. Historique :
> **« Ajouter à mon Oto » (canal d'acquisition).** La page publique porte un CTA qui deep-linke
> `dashboard.oto.ninja/import?slug=<slug>` → route `/import` (`ImportProjectView.vue`, hors shell
> console, gère sa propre auth comme `InviteAcceptView`) : au login, appelle
> `importSharedProject(slug)` (`POST /api/me/projects/import`) puis `router.replace('/projects/'+id)`.
> Le backend forke le projet publié dans l'org active (structure only, jamais de credentials ;
> idempotent — récupère la copie déjà présente). Voir `oto-backend/docs/projects.md`.
> **Retiré** : le partage public **chiffré** zero-knowledge (`PublicProjectView.vue`, route
> `/p/p/:token`, `lib/crypto.ts`, `publishProjectShare`/`getPublicProjectShare`) — supplanté par
> le navigable live. Le viewer public de **doc** (`/p/d/<token>`) reste rendu **server-side** par
> le backend via Caddy (pas de route SPA ; `PublicDocView.vue` déjà supprimé).
