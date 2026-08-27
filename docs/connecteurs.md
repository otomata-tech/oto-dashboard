---
title: Connecteurs (front)
type: reference
description: >-
  Le moteur unique connector-scope (4 surfaces user/team/org/plateforme sur un jeu d'adaptat
  eurs), la présentation verdict-first, les 3 projections par audience (ADR 0022), la carte-
  shell partagée, le compte partagé autorisé, la fédération MCP et les points d'entrée à ong
  lets. Contient la prose historique des refontes.
---

# Connecteurs — surface unifiée, projections, hubs à onglets

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Refonte « connector-scope » (08/07/2026) — le moteur unique

> **⚠️ Refonte « connector-scope » (08/07/2026) — le détail ci-dessous est en partie PÉRIMÉ.**
> Les **4 surfaces** de gestion de connecteurs (user/team/org/plateforme) tournent désormais
> sur **UN moteur unique** : `components/console/connector-scope/` — `ConnectorScopeView`
> (fragment) + `pickAdapter(useScope().level)` → `use{User,Team,Org,Platform}Adapter`,
> réutilisant `ConnectorList` (table générique) + `ConnectorModal` (**panneau latéral docké,
> plus une modale**). Chaque
> adaptateur porte des **leviers OPTIONNELS** (availability variants master/binary/exposure3/
> readonly · credential single/multi · access · redaction+email [org] · connection+tools+lenses
> [user]) — un levier absent ⇒ colonne/onglet omis (jamais inerte). Panneaux de drawer :
> `Connector{Availability,Credential,Access,Connection,Tools,About}Panel`. Les widgets de
> connexion (`ConnectorOAuthAccounts`/`SessionWidget`/`HostedWidget`/`FederatedWidget`) sont
> **réutilisés verbatim** dans `ConnectorConnectionPanel`. Chaque scope garde un wrapper mince
> (`AdminConnectorsView`/`OrgConnectorsView`/`TeamConnectorsView` + le panneau `mine` du hub)
> qui fournit `.content-inner` + ses cartes header/footer propres. **SUPPRIMÉS** : `ConnectorsView`,
> `ConnectorDrawer`, `GroupConnectorsCard`, `ConnectorAdminCard`, `OrgConnectorDrawer`. Nouveau
> pouvoir **team** (gouvernance d'équipe restrict-only) : dispo + accès, cf. oto-backend B1/B2.
> La prose historique ci-dessous reste utile pour le VOCABULAIRE (3 projections, cascade, 3 états)
> mais les noms de composants (`ConnectorCard`, `ConnectorsView`…) ne valent plus.
> **Lot 2 (17/07, PROD)** : présentation **verdict-first** — liste = colonne « État » en langage
> clair (`lib/connectorVerdict.ts`, copy verbatim du CDC JB ; `pending_action` backend rendu tel
> quel) ; panneau = `ConnectorVerdictLine` (diagnostic 3 couches derrière « Pourquoi ? ») +
> `ConnectorKeyStack` (pile de provenance, dépliage auto si ≥2 clés/suspendue/prêt ;
> **Suspendre/Réactiver** → `suspendInstance`) — sa logique vit dans **`lib/keyStack.ts`**
> (testée), **miroir de `access.walk_cascade`** côté backend : c'est elle qui décide ce que
> le dialog de retrait ANNONCE, donc une erreur n'y casse rien à l'écran, elle fait mentir
> l'UI. Ne lit que le palier de l'équipe **active** — comme la cascade ; vocab adaptatif solo via
> `me.active_org_is_personal` (jamais « org »/« équipe » en solo) ; onglet « confidentialité »
> du drawer user = MÊME policy/éditeur que /org/connectors (`scopeNote` piloté par l'appelant).
> **Lot fidélité (21/07, PROD — dashboard v1.4.0)** : le détail est un **PANNEAU LATÉRAL** (`ConnectorModal`,
> docké à droite, liste visible, Échap, nav clavier **↑/↓** dans `ConnectorScopeView`), sections en
> **ACCORDÉONS** (`ConnectorScopeDrawer` = `<details>`, plus d'onglets ni d'état `tab`) ; verdict
> **« Connexion KO »** (terra) sur `ProviderStatus.health_ko` (flag santé backend, cf. oto-backend) ;
> **lentille par défaut** = « connectés » si l'user en a, sinon « tous » ; retrait de clé qui **nomme
> le relais** (`KeyStack`) ; **mobile** M7 (cartes empilées + sheet plein écran, CSS `@media ≤640px`) ;
> **« Effet pour un membre »** (M4, `ConnectorEffectForMember`, scope org → `getConnectorEffectForMember`).
> i18n FR complète (0 terme banni). Partage projet : `ProjectShareDialog` = lien public simplifié +
> **`ProjectMcpPublishDialog`** (picker d'outils à cases groupées par connecteur, R3).

## La section unique `/console/connectors` (prose historique, vocabulaire)

Section unique `/console/connectors` (`ConnectorsView.vue`) : **fusion** des ex-écrans
`/my-connectors` + `/connectors` + `/toolbox` (qui redirigent désormais ici). Un connecteur
= **UNE chose à deux faces** : la **config de la connexion** (credential) ET le **paramétrage
de ses outils** (toolbox). Chaque connecteur est une carte (`ConnectorCard.vue`) portant les
deux + un **sélecteur 3 états** câblé sur `connector_selection` (ADR 0019, `getMyConnectors`/
`selectConnector`/`pauseConnector`/`unselectConnector`) :
- **active** (`state=active`) — outils exposés à l'agent (visibilité normale).
- **hidden / masqué** (`state=paused`) — installé mais outils cachés de l'agent.
- **off / désactivé** (`not_selected`) — **le défaut**, connecteur non installé.

La carte dérive sa face credential des champs du registre (`ConnectorMeta`) : **tous les
flux d'auth sont édités INLINE sur la carte** (ADR 0024) — keyé (`credential_fields`) →
formulaire (`setCredential`) ; oauth/cookie/hosted/fédéré → widget dédié inline
(`ConnectorOAuthAccounts`/`ConnectorSessionWidget`/`ConnectorHostedWidget`/`ConnectorFederatedWidget`,
dérivés de `connKind`). **Plus de cartes ancrées** `#sessions`/`#google`/`#federated`/`#messaging`.
`ConnectorSessionWidget` porte aussi le picker de **cible par défaut** (sélecteur d'identité
ADR 0024, gaté `ConnectorMeta.identities` — pennylaneged : la **GED cible**, une société
cliente par client, issue otomata-private#31) : la cible courante vient de
`me.providers[name].identity_label` (zéro coût), le **listing** (`getConnectorIdentities`)
loue une session Browserbase (~10 s) → chargé au clic seulement ; choix via
`setConnectorIdentity`.
> **Session navigateur (`connKind='session'` : brevo/crunchbase).** `ConnectorSessionWidget`
> dérive l'état de `me.providers[name]` (`user_key_configured` + `session_set_at`, plus de
> `me.crunchbase`). « Connecter » ouvre `ConnectorSessionConnect.vue` = **Live View Browserbase
> en iframe** (`startConnectorSession` → login → `finalizeConnectorSession`) ; au succès, reload
> du `me` → « session set / disconnect ». Déconnexion = `deleteApiKey(name)`. PLUS d'extension
> cookie ni de renvoi vers le MCP. Backend : `oto-backend/CLAUDE.md` §Browser automation.
La carte dit en clair **quelle clé résout** (`status.mode` → « ta clé perso / la clé de ton org /
la clé plateforme oto »). Les toggles d'outils restent `enableTool`/`disableTool`. Les **presets**
de toolbox vivent en bas de la même vue. Les **tokens CLI** ont migré vers le **hub compte**
(`/account`, `AccountTokensCard.vue`) — user-scopés (`/api/me/tokens`).

## Carte = shell partagé (ADR 0024 §3), UI alignée sur les 5 surfaces (2026-07-02)

> **Carte = shell partagé (ADR 0024 §3), UI alignée sur les 5 surfaces (2026-07-02).**
> `ConnectorCardShell.vue` porte le chrome commun (logo/nom/badges/corps + variantes
> `to` = nom→fiche, `clickable`/`fill` = tuile de grille) ; consommé par les TROIS
> projections — USER `ConnectorCard` (connexion + outils), ORG `ConnectorOrgCard`
> (gouvernance), PLATEFORME `ConnectorAdminCard` (master + clé plateforme — la vue
> admin est passée de la table aux cartes) — ET par les tuiles marketplace
> (`ConnectorLibraryView`) / partagés (`ConnectorsSharedView`). Badges **canoniques**
> = `ConnectorBadges.vue` (catégorie=ink, auth=cobalt, fédéré=saffron, gratuit=olive,
> grant-only=pill bordée — un axe = une couleur, partout). Sur toute carte, **le nom
> du connecteur ouvre sa fiche de présentation** (`/connectors?tab=marketplace&connector=<name>`,
> `ConnectorDetail.vue` — même cible que les entités liées d'un projet).

## Compte partagé autorisé (otomata-private#55, unipile)

> **Compte partagé autorisé (otomata-private#55, unipile).** Sur le widget hosted
> (`ConnectorHostedWidget.vue`) : côté **propriétaire**, chaque canal connecté porte une
> section « opéré aussi par » (`AccountShareSection.vue`) — autoriser un membre de l'org
> active (picker `getOrg().members`, `grantAccountAccess`) / révoquer (effet immédiat) ;
> côté **membre autorisé**, le compte accordé apparaît dans le picker d'identités avec le
> tag « partagé par X » (`ConnectorIdentity.granted`/`owner`) et « use this account »
> bascule dessus (pointeur backend, son propre compte reste intact). Le widget appelle
> désormais TOUJOURS `getConnectorIdentities` (le backend décide selon le mode — revente
> sans grant → liste vide, inchangé). API : `getAccountGrants`/`grantAccountAccess`/
> `revokeAccountAccess` (`/api/me/connector-accounts/*`). Backend : `oto-backend/CLAUDE.md`
> §Compte partagé autorisé.

## Plusieurs comptes sur un connecteur à clé (#121, 27/08/2026)

> **Un compte du coffre = un workspace Slack, une organisation Zoho, un site du
> navigateur connecté.** Le backend sert N comptes nommés par connecteur à clé
> (multi-compte par défaut, credentials multi-champs inclus — oto-backend#409) ; le
> dashboard ne lisait `cardinality` que dans sa branche OAuth, donc la famille
> « formulaire de champs » n'avait aucun moyen d'en poser un deuxième autrement qu'en
> appelant l'API à la main.
>
> **Le mot vient du REGISTRE, pas de l'écran** (`auth.account_noun` : « workspace »,
> « organisation », « site », « compte » par défaut) — écrire « compte » partout
> obligerait l'utilisateur à traduire, et le front n'a aucun moyen de savoir.
>
> **Le premier compte reste anonyme** : la pose ordinaire ne change pas d'un pixel
> (c'était 100 % des cas — 26 lignes en base le 27/08, aucune nommée). Le nom n'est
> demandé qu'à partir du **deuxième** (`CredentialDialogSpec.accountMode`, `'new'`), et
> il est alors obligatoire : le serveur migre lui-même la ligne anonyme vers un libellé
> au premier compte nommé, et refuse une pose anonyme là où des comptes nommés existent.
> **L'écran suit ces règles, il ne les rejoue pas** — un doublon de nom est le seul refus
> anticipé côté saisie, pour éviter un aller-retour.
> Composants : `ConnectorKeyAccounts.vue` (liste, compte par défaut, retrait, « ajouter
> un <mot> ») monté dans le panneau de connexion dès qu'un credential est posé sur un
> connecteur `multi_account` ; `CredentialFieldsDialog.vue` (champ nom) ; geste
> `ConnectionLever.addAccount` (scope USER — org/équipe posent toujours leur compte
> partagé unique).
>
> ⚠️ **Piloté par la liste SERVIE** (`getConnectorIdentities`), jamais par une clé
> composée reconstruite ici : quand le backend donnera aux instances un identifiant
> stable (chantier v3 L6), cet écran n'aura rien à changer.
>
> ⚠️ **Le miroir de la cascade a dû apprendre le multi-compte** (`lib/keyStack.ts`,
> `relayFor`). En mono-compte, « retirer ma clé » avait une seule suite possible : le
> palier du dessous. Avec deux comptes au même palier, la cascade n'en choisit AUCUN
> d'office (anti-usurpation) — elle demande lequel. Annoncer l'un d'eux comme relais
> serait faux, annoncer « ton agent perdra ce connecteur » aussi : le dialog de retrait
> dit désormais « il te restera N workspaces — ton agent devra préciser lequel ». Et les
> lignes de la pile portent le nom du compte, sinon deux « Ta clé » ne se distinguent pas.

## Un connecteur = 3 projections par audience (ADR 0022)

**Un connecteur = 3 projections par audience (ADR 0022).** La même chose vue de trois sièges,
une carte par niveau du level-switch :
- **USER** `/console/connectors` (`ConnectorsView`, ci-dessus) — j'installe / mes clés / mes
  outils. **La rédaction de champs N'Y EST PLUS** : c'est une feature ORG, retirée de la carte
  user le 2026-06-24.
- **ORG** `/org/connectors` (`OrgConnectorsView` → `ConnectorOrgCard`) — ce que l'org propose &
  impose : **disponibilité BINAIRE** (un seul toggle « disponible / coupé pour mes membres »,
  capacité `connectors.activation.{org_list,set_org,clear_org}`). **La vue ne liste QUE les
  connecteurs activés par la plateforme** (master ON, ou grant-only accordé à l'org) — invariant
  cohérent avec la surface USER (`_org_list` filtre, corrigé 2026-06-24) ; **plus de carte « coupé
  par la plateforme » inerte** (jamais de levier inerte). **Pas de « forcer dispo »** ni de
  **« recommandé »** (retiré le 2026-06-24). **Rédaction ÉDITABLE**. Clé partagée d'org + baseline
  toolset restent pour l'instant dans `/org` (rapatriement différé).
  > **Email géré PAR CONNECTEUR** (`ConnectorEmail.vue`, accordéon « expéditeurs & envoi » dans
  > `ConnectorOrgCard`, pour `scaleway`+`resend`) : expéditeurs + fenêtre calme par connecteur (le
  > transport en dérive, lecture seule). Réutilise les primitives `components/console/config/`
  > (`ConfigPanel`/`ConfigSection`/`EditableCollection`) — template de config réutilisable, à
  > adopter par les autres cartes au fil de l'eau. Encart « envois programmés » en pied de vue.
  > Backend : `oto-backend/CLAUDE.md` §Email (scaleway grant-only Otomata / resend BYOK ; issue #64
  > = vérif de domaine par org). **Pas de page autonome `/org/email`** (supprimée).
  > **Rédaction des champs** (`ConnectorTransforms.vue`) : sur **tout** connecteur (plus gaté sur un
  > schéma curé). Le schéma affiché = **observé** (capture passive backend, cf. `oto-backend/docs/redaction.md`)
  > ∪ curé ∪ champs sous règle ; **rien par défaut** + **modèles 1-clic** (anonymisation candidat/bancaire) ;
  > **toggle actif/en-clair + éditer** par champ (`FieldRuleDialog.vue`) ; **dry-run** (`RedactionPreview.vue`)
  > pour voir avant→après sur un échantillon réel.
- **PLATEFORME** `/platform/connectors` (`AdminConnectorsView` → `ConnectorAdminCard`) — master
  switch + **clé plateforme** (set/remove inline, réservé super_admin ; absorbe l'ex-`/platform/keys`,
  qui redirige). **Cartes sur le shell partagé** (plus de table, 2026-07-02) — même liste que
  user/org (recherche + chips + tri actifs d'abord). Entitlements de namespace restent par org
  dans `/platform/orgs`.

## Fédération MCP (otomata#16)

`ConnectorsView.vue` porte la carte « federated mcp » (connect/disconnect d'un compte
fédéré per-user, OAuth via `/api/<connecteur>/oauth/*` — `getFederatedStatus`/
`startFederatedOauth`/`disconnectFederated`, variante de widget `oauth_federated`).
Connecteurs concernés : atlassian, folkmcp.

> **Connecteur memento retiré (2026-07-30).** Produit décommissionné : `MementoView.vue`,
> les appels `/api/memento/*`, les types `Memento*` et la clé `me.memento` ont été
> supprimés ; `MementoStatus` est devenu `FederatedStatus` (le type était déjà partagé
> par le flux fédéré générique). La mémoire est native : zone Documents / `oto_kb`.

## Connecteurs & procédures — point d'entrée à onglets (découverte fusionnée)

Le groupe nav « library » a **disparu** : les bibliothèques (découverte) sont fusionnées
en **onglets** des pages de gestion `/connectors` et `/procedures`, chacune devenue un
**point d'entrée unique** à onglets (`SubTabs.vue`, état porté par `?tab=` via `useDeepLink`).
Onglet par défaut = `mine` (`?tab` absent = URL propre). Les ex-routes `/library/connectors`
et `/library/doctrines` **redirigent** vers `…?tab=marketplace` (`router/index.ts`) ;
`/doctrine` et `/doctrine/:id` **redirigent** vers `/procedures[…]`.

- **`/connectors`** = host `ConnectorsHubView.vue`, 3 onglets :
  - `mine` — `ConnectorsView.vue` (projection USER inchangée : connexion + outils + presets).
  - `shared` (« partagés ») — `ConnectorsSharedView.vue`, **lentille de consommation lecture
    seule** : connecteurs résolus par une **clé partagée** d'org/équipe, dérivés **sans fetch
    dédié** de `me.providers[name].mode ∈ {org, group}` (cascade `access.resolve_credential`).
    La gestion reste dans `mine`.
  - `marketplace` — `ConnectorLibraryView.vue` (catalogue navigable, ex-connector library)
    + **fiche détail deep-linkée** `?connector=<name>` (`library/ConnectorDetail.vue`) :
    `description` curée (backend `connector_docs.py`, fallback `help`), **outils du
    registre résolu** (`getToolRegistry`, groupés par namespace, nom + description),
    **config credential** (méthode d'auth expliquée + champs avec `help` + « la clé
    peut venir de » — `lib/connectorAuth.ts`), doc how-to complète (4 kinds, triée
    usage→prerequisite→setup→note). La carte grille porte description + chip d'auth
    + nb d'outils ; recherche étendue à description + noms d'outils. L'onglet outils
    de `ConnectorCard` (mine) affiche aussi la description sous chaque toggle.
- **`/procedures`** = host `DoctrineHubView.vue`, 2 onglets :
  - `mine` — `DoctrineView.vue` (**100 % procédures** de l'org/équipe, édition/versions/usage ;
    l'agent readme n'y apparaît plus — slug `claude_md` réservé, édité sur `/org`).
    Route détail `/procedures/:id` (`procedure-detail`).
  - `marketplace` — `DoctrineLibraryView.vue` : procédures publiques avec **auteur** (badge
    « Otomata » ou org créatrice), recherche + filtres auteur/topic, preview markdown,
    **fork** dans l'org active (org_admin), unpublish conditionnel. API `listLibraryDoctrines`/
    `getLibraryDoctrine`/`forkLibraryDoctrine`/`unpublishDoctrine`. `DoctrineView.vue` garde
    l'action **« publier »** d'une procédure (org_admin → `publishDoctrine`). Backend :
    `oto-backend/CLAUDE.md` §REST (capacités `library.*`).
  > NB : les identifiants de code/API gardent le mot « doctrine » (`Doctrine*View`,
  > `getDoctrine`, endpoints `/api/me/instructions*`, resource_type `doctrine`) — seul le
  > vocabulaire produit (routes, copy) est passé à « procédure » / « agent readme ».

Les hosts montent leurs panneaux en `v-if` (lazy `defineAsyncComponent`, chunks préservés) ;
chaque panneau garde son propre deep-link (`?doc=`, `?preview=`) qui coexiste avec `?tab=`.
