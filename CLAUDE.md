# oto-dashboard

Dashboard produit d'**oto-mcp** (gestion de compte, connecteurs, orgs, doctrine) — le successeur d'`oto-app/account/` ([ADR 0007](https://github.com/otomata-tech/otomata/blob/main/docs/adr/0007-dashboard-repo-separe.md)). Repo `otomata-tech/oto-dashboard`, local `/data/oto/oto-dashboard/`.

**Pas de `server/`** : le backend du dashboard EST oto-mcp (REST `https://mcp.oto.ninja/api/*`, JWT Logto ES384). Le front ne détient aucun secret (ADR 0004). C'est le seul écart au scaffold dev-init classique — ne pas ajouter de BFF sans décision explicite.

## Stack (dev-init, moitié frontend)

- Vue 3 + Vite + TypeScript (`frontend/`), port dev **5192**
- shadcn-vue (base reka, style vega, stone) + Tailwind CSS v4 — composants dans `src/components/ui/`
- Tokens Otomata (« Manuscrit chaud ») en CSS pur — **aucune dépendance à @otomata/ui**. ⚠️ Deux fichiers, ne pas confondre : `src/assets/main.css` (`@theme`) ne déclare que les **6 couleurs de base** (génération des utilitaires Tailwind) ; le **set complet** (`--color-surface`/`-bg`/`-ink-soft`/`-hair-soft`/`-paper-3` + tous les `-soft`/`-ink` des accents + `--ease-out`, classes `.o-medallion`/`.fadein`, keyframes `oto-pulse`) vit dans **`src/assets/console.css`**, importé global via `main.ts`, consommé par les vues console en `var(--…)`. Pour un écran console, piocher dans `console.css`.
- **Design system console : `DESIGN.md`** (racine repo) — catalogue d'usage des classes `console.css` (shell, card, grilles, stats, tables, tags sémantiques, boutons, états empty/error/loading, checklist nouvel écran) + tableau « marketing vs console » (mêmes tokens, deux dialectes à ne pas transplanter). Tokens « Manuscrit chaud » communs : `@otomata/ui` `THEME.md`.
- Auth : `@logto/browser` (PKCE) via `src/composables/useAuth.ts` — interface `initAuth/login/logout/getAccessToken` ; `getAccessToken` lève `stale_session` sur token undefined (gotcha @logto)
- API : `src/api.ts` — fetch authentifié vers `VITE_OTO_MCP_BASE`

## Commandes

```bash
cd frontend && npm install
honcho start            # ou : cd frontend && npm run dev (port 5192)
npm run build           # vue-tsc + vite build → frontend/dist
```

`.env` : copier `frontend/.env.example` (VITE_LOGTO_APP_ID à créer via le skill `logto-client` — pas de DCR, client SPA pré-créé avec redirect `https://<domaine>/callback` + `http://localhost:5192/callback`).

### Tester un fix EN LOCAL contre les VRAIES données de prod (pas des fixtures)

Pour vérifier un changement frontend contre son propre compte/org réel plutôt que
contre des données inventées : copier `VITE_LOGTO_ENDPOINT`/`VITE_LOGTO_APP_ID`/
`VITE_LOGTO_AUDIENCE`/`VITE_OTO_MCP_BASE` depuis `frontend/.env.production` (déjà
committé) dans son `.env` local, puis `npm run dev` (redémarrage requis — ces vars
sont lues au boot de Vite, pas rechargées à chaud) et se logguer normalement à
`localhost:5192` avec son vrai compte. Le client SPA Logto de prod autorise déjà
`http://localhost:5192/callback` en redirect (cf. ligne au-dessus) — aucune inscription
supplémentaire nécessaire. Un `client_id` PKCE SPA n'est PAS un secret (pas de client
secret dans ce flow OAuth) — voir le commentaire en tête de `.env.production` ; seul le
credential Management API (`logto-client` skill, création de NOUVEAUX clients) est
sensible, et il n'est pas nécessaire pour ce test.

Laisser `VITE_POSTHOG_KEY`/`VITE_SENTRY_DSN` vides dans le `.env` local (pas de
télémétrie réelle depuis une session de test). `.env` reste gitignore — ne jamais
committer ces valeurs dans un `.env` versionné (elles vivent déjà, non secrètes, dans
`.env.production`).

## État / feuille de route

**Live en prod** : `dashboard.oto.ninja` est servi par ce repo (`/opt/oto-dashboard/dist`, deploy CI `deploy.yml`), `app.oto.ninja` redirige dessus (302). L'ancien `account/` (oto-websites) **a été supprimé et décommissionné** (account.oto.zone, 2026-06-15) — le cutover est **fait**, plus de double-service. La migration des features (connecteurs, orgs, doctrine, admin, datastore) s'est faite écran par écran. Suivi : `otomata#20` + issues de ce repo.

## Groupes / départements (ADR 0012)

Section `/console/groups` (`GroupsView.vue` + `GroupDoctrineCard.vue`) : départements d'une org avec **chef d'équipe** (`group_admin`). Un membre bascule son **groupe actif** (`useGroup` → `PUT /api/me/active-group`) ; le chef (ou un org_admin) gère membres, **secrets partagés** (résolus avant ceux de l'org), **preset de toolset** (baseline de visibilité) et **doctrine** de groupe. Hiérarchie de droits côté backend (`roles.py`, escalade descendante) — l'UI masque seulement les contrôles. `Me` porte `active_group`/`active_group_name`/`group_role` ; `ProviderStatus.mode` peut valoir `group` (libellé « team key »). Contrats : `oto-backend/docs/groups-and-roles.md`.

## Invitations — feature cascade (plateforme / org / équipe)

Inviter un user est une **feature cascade** (même geste aux 3 niveaux, comme la gouvernance
connecteurs). UNE carte partagée `components/console/InvitationsCard.vue` (câblage API dans
`composables/useInvitations.ts`) montée sur les 3 écrans, gatée sur le rôle qui gère :
- **org** → `OrgView.vue` (`/org`, `scope={level:'org', id}`, gate `isOrgAdmin`) — l'invité rejoint l'org.
- **équipe** → `GroupDetailCards.vue` (`/team`, `scope={level:'team', id}`, gate `canManage`) — l'invité rejoint l'org PUIS l'équipe. (À côté du geste « ajouter un membre déjà dans l'org ».)
- **plateforme** → `AdminUsersView.vue` (`/platform/users`, `scope={level:'platform'}`, gate admin plateforme) — onboarding pur (org perso au signup).

Chaque niveau expose la même triade REST (`api/console.ts`) : `list*Invitations` / `invite*` /
`revoke*Invitation` (org : `/api/orgs/{id}/invitations` ; équipe : `/api/groups/{id}/invitations` ;
plateforme : `/api/admin/invitations`). **Acceptation commune** inchangée : `InviteAcceptView.vue`
(routes `/invite`, `/invitation/:code`) → `acceptInvite({token?|code?})`, avec copy adaptée au
scope (`InvitePreview.scope`/`group_name` → « rejoindre l'équipe X / oto »). Backend :
`oto-backend/docs/rest-api.md` §invitations + `capabilities/{orgs,groups,platform}_invites.py`.

## Connecteurs — surface unifiée (connexion + outils, 3 états)

> **⚠️ Refonte « connector-scope » (08/07/2026) — le détail ci-dessous est en partie PÉRIMÉ.**
> Les **4 surfaces** de gestion de connecteurs (user/team/org/plateforme) tournent désormais
> sur **UN moteur unique** : `components/console/connector-scope/` — `ConnectorScopeView`
> (fragment) + `pickAdapter(useScope().level)` → `use{User,Team,Org,Platform}Adapter`,
> réutilisant `ConnectorList` (table générique) + `ConnectorModal` (drawer à onglets). Chaque
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

**Object-browser admin (ADR 0030).** `/platform/objects` (`AdminObjectsView`) = projection
PLATEFORME des **objets possédés** (généralise le level-switch à tout objet, pas que les
connecteurs). v1 = `datastore_namespace` : liste owner + nb rows + transfert (via `oto_resource`
op-aware, `POST /api/resources`). **Plan gouvernance only** — jamais le contenu des lignes
(lecture = view-as audité). Pensé pour se **dériver** du registre de capacités
(`GET /api/admin/capabilities`, JSON Schema des Input) — l'ossature accueille les autres types
sans réécriture. Réutilise `DataTable`/conventions admin existantes (pas de framework admin tiers,
TanStack présent mais inutilisé).

## Fédération MCP (memento, otomata#16)

`ConnectorsView.vue` porte la carte « federated mcp » (connect/disconnect du compte memento
per-user, OAuth via `/api/memento/oauth/*`). Depuis 2026-06-17 la fédération memento est
**systématique** côté oto-mcp (connecteur `self_serve`, monté d'office) → la carte s'affiche
pour **tous** les users (plus seulement les entitled). La carte « next step » d'`OverviewView`
inclut une étape « connect your knowledge base » tant que `me.memento.connected` est faux.
`Me.memento` (`{connected, set_at}`) vient de `GET /api/me`. Le compte memento est
provisionné automatiquement à la création du compte oto (côté backend).

> **Onboarding = un projet (ADR 0032 §7, 2026-07-01).** Plus d'écran « get started » ni de
> mode d'accueil spécial : le composant `GetStartedGuide.vue` et la variante `onboarding`
> d'`OverviewView` ont été retirés. L'accueil est le projet « Découverte » (sous `/projects`),
> semé à la création de l'org perso. `Me.onboarding` retiré ; la fiche « situation avec oto »
> (profil) vit côté agent via `oto_profile`, plus dans le dashboard.

## Projets (couche d'organisation, ADR 0030 + modèle produit 2026-06-27)

Groupe nav **workspace** → `/projects` (`ProjectsView.vue`, **index grille**) + page dédiée
**`/projects/:id`** (`ProjectDetailView.vue`, route résolue par `ConsoleLayout` via
`route.name==='project-detail'`, `viewKey=fullPath` → remount sur `:id`, même patron que
`admin-user`). Un projet = brief (point d'entrée) + **pages markdown arborescentes**
(`ProjectDocs.vue`, capacité `oto_doc`) + **entités liées** (tableau/procédure/connecteur/base,
picker des vraies entités via `getNamespaces`/`getConnectors`/`getDoctrine`/`getMementoWorkspaces`)
+ **partage/transfert** (`oto_resource` resource_type=`project`, réutilise `getResource`/
`shareResource`/`transferResource`) + **journal d'activité**. API client : `*Project*`/`*Doc*`
dans `api/console.ts` (POST op-aware `/api/me/{projects,docs}`). Backend : `oto-backend/CLAUDE.md`
§Projet. Non faits : MCP-App rendu, édition temps réel, pré-set vendable.

> **Slots & inventaire dérivé (ADR 0035, B4/B5).** Le formulaire « publier en endpoint MCP »
> **préremplit** ses outils depuis l'inventaire dérivé (`getProjectInventory` = op `inventory` :
> refs `<tool:>` des procédures liées ∪ outils des runs) quand le projet n'a pas de liste curée —
> on cure, on ne retape pas. La même réponse porte l'**`audit`** (liens morts / slots de procédure
> non bindés / procédures inertes) → bandeau « liens à vérifier » de `ProjectDetailView`,
> rechargé après lier/délier. Un lien peut porter un **`slot`** (binding nommé, 409 `slot_taken`).

> **Partage NAVIGABLE d'un projet (ADR 0032) — `<slug>.share.oto.cx`.** `ProjectDetailView`
> porte la carte « Endpoint MCP & partage » : pour un projet publié en `secret`, elle affiche
> le **lien de partage navigable** `https://<slug>.share.oto.cx` (dérivé côté front de
> `mcp_slug`/`mcp_access`, aucun secret) + l'endpoint connecteur `…/mcp`. Les invités y naviguent
> les procédures/tableaux/docs en **lecture seule**, rendus **server-side** par le backend
> (`share_ui`) — rien à faire côté front (pas de viewer SPA). Le backend expose aussi `share_url`/
> `mcp_url` (per-mode) sur `oto_project(op=get)`.
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

## Mémoire — datastore + knowledge (ADR 0016)

Groupe nav **« memory »** (`consoleNav.ts`) = deux surfaces de mémoire :
- **Datastore** (`/console/data`, `DataView.vue`) — stockage tabulaire, **substrat PG natif** (plus Google Sheets). Grille **server-driven** (`DataTable.vue` : tri 3 états/recherche/pagination/**filtres par colonne** côté API via `getNamespaceRows({offset,limit,order_by,order_dir,q,filters})` — ops par type dérivé `datastoreFilters.ts` (text/number/date/bool), cellule `ColumnFilterCell.vue`, chips des filtres actifs retirables, taille de page 25/50/100, header sticky ; rendu cellules typé `cellRender.ts`) ; clic row → détail/édition (`RowDrawer.vue`). **Deeplink par id** (`?ns=<id>`, `NamespaceEntry.id` BIGSERIAL stable → le **renommage** ne casse pas l'URL) **+ état du tableau MIROIR dans l'URL** (`?q/sort/dir/page/ps/f`, `readTableQuery`/`syncTableQuery` — refresh et partage de lien conservent la vue filtrée ; `?f=` sérialisé par `filtersToParam`/`filtersFromParam`, param malformé ignoré). **Ownership ADR 0030** : les droits viennent du payload (`can_write`/`can_govern`/`owner_type`), plus de `isOwner` dérivé du flag `shared` ; read-only = `can_write===false`, boutons share/rename/transfer/delete gatés par `can_govern`. **org-owned activé** : la création propose un scope (perso / classeur d'org active) via `promptForm` select → `createNamespace(ns, {type:'org', id})` ; badge « org »/« team » sur la liste. **share** (`SharePrincipalDialog.vue`, dialog de partage unifié membre/équipe/org via `oto_resource` — aussi utilisé par projets et doctrines ; sélecteur de **rôle** lecteur/éditeur/**gérant** via `lib/resourceRole.ts`, ADR 0048 — le gérant a la gouvernance grantable), **rename**, **transfer** (l'ancien proprio repasse en grant write). Plus de gate Google.
- **Knowledge** (`/console/knowledge`, `KnowledgeView.vue`) — connexion **Memento opt-in** (réutilise `getMementoStatus`/`startMementoOauth`/`disconnectMemento`, mêmes endpoints que la carte federated mcp de `ConnectorsView`) ; pas de browse des KB (déféré). Retour OAuth `?memento=connected|error`.

## Agent readme (ex-« doctrine de base ») — unbundlé des procédures (2026-07)

**Deux objets, deux mots, deux surfaces** (fin du bundle historique de l'écran doctrine) :
- **agent readme** = prose libre **injectée à chaque session** (bloc C backend), **cumulable
  par niveau** : plateforme (`/platform/instructions`) → org (**carte sur `/org`**,
  `AgentReadmeCard` branchée sur `putInstruction('claude_md')`)
  → équipe (`GroupDoctrineCard`, `/org/departments`) → user (**carte sur `/account`**,
  `GET/PUT /api/me/agent-readme`). Composant générique `AgentReadmeCard.vue` (props
  load/save). **Prose PLATE, sans versioning** (ADR 0042 : le readme vit dans `guides`, l'UI
  versions/restore retirée le 2026-07-06) — ≠ les PROCÉDURES nommées, qui gardent leur
  versioning (DoctrineView). Pas de compteur d'usage (l'injection n'est pas un tool
  call) — le tag dit « injecté à chaque session ».
- **procédure** (ex-skill / doctrine nommée) = déroulé opératoire **chargé à la demande**
  (`oto_get_doctrine(slug)`), publiable/forkable/partageable/liable à un projet.
- **guide** (ADR 0042, prose PLATE **chargée à la demande** via `oto_guide` — pendant du
  readme, mais pas injectée) = how-to éditable dans la console : `GuidesCard.vue` (créer/
  éditer/supprimer, éditeur + confirmation **inline**, jamais de dialog natif), montée dans
  la page « ce que voit ton agent » — scope **user** (`/context`, couche 2d) et **org**
  (`/org/context`, admin d'org) ; les guides **plateforme** y figurent en référence lecture
  seule. Client REST `getGuides`/`getGuide`/`setGuide`/`deleteGuide` (capacité backend
  `me.guides.*`, `/api/me/guides…`), types `Guide`/`GuideScope`.

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

## Identité — affichage (sidebar) + switch (popin compte)

Deux surfaces distinctes depuis le 2026-07-03 (pattern SaaS classique — le switch d'org
vit dans le menu compte, pas sur un badge cliquable) :
- **Affichage** : l'axe **identité** (« qui je suis » = sous quelle identité Claude agit :
  **compte (sub) × org active × équipe active**) vit en **tête de la sidebar**
  (`ConsoleIdentity.vue`, monté dans `ConsoleSidebar.vue`), **AFFICHAGE SEUL** (plus de clic
  → dialog). Logo org + nom + rôle + équipe, **s'adapte au niveau** (`useScope().level`) : en
  `org` il se recompose en **bannière org** ; kicker **« consultation »** quand l'org/équipe
  vue ≠ la maison.
- **Switch** : dans la **popin compte** (`ConsoleUserMenu.vue`, pied de sidebar). En tête de
  la popin, `WorkspaceSwitcher.vue` liste mes orgs + crée un workspace ; sous l'org courante,
  une ligne discrète de **chips d'équipe** — affichée **seulement si j'ai des équipes dans
  cette org** (`listGroups(orgId).filter(g => g.my_role != null)`), fini « toute l'org / aucune
  équipe » (dénué de sens pour les 95 % d'orgs sans équipe). Changer d'org m'y dépose dans MON
  équipe (la première). `IdentityDialog.vue` **supprimé** (son seul consommateur était le badge).

**Consultation (view-as) vs maison — ADR 0023 (clé à comprendre).** Choisir une org/équipe
dans le switcher est de la **CONSULTATION** : ça change seulement ce que le **dashboard** affiche,
**zéro effet MCP** (contrainte dure : jamais de bascule d'identité Claude depuis le FE — ça
casserait une conversation en cours). Mécanique : `lib/viewOrg.ts` pose les headers
`X-Oto-Org`/`X-Oto-Group` (persistés localStorage, injectés par `api()`/`apiUpload` →
`viewHeaders()`) ; le backend scope ses vues dessus sans rien persister. `setViewOrg`/
`setViewGroup` + `location.reload()` (les vues sont org/group-scopées). Changer d'org vue
efface l'équipe consultée (invariant).
- **org maison** (le défaut MCP) se règle par le **seul geste qui touche le MCP** :
  `setActiveOrg`/`useGroup` (REST = pose la maison). ⚠️ **Ce geste a quitté le switcher**
  (2026-07-03) — le switcher est consultation PURE, zéro écriture MCP ; « définir comme maison »
  migre vers la page **agent context** (« manage agent », en construction). `me.home_org`/
  `home_group` = défauts ; `me.active_org`/`active_group` = effectifs (consultation ?? maison).
- **identité d'action de Claude** = `oto_use_org`/`oto_use_group` **dans Claude** (override de
  session éphémère, retour maison à la conversation suivante). Le dashboard ne le règle jamais.
  Compte (sub) lecture seule (fixé par l'OAuth claude.ai).

Erreurs en **toast**. L'identité n'est PAS le level-switch du topbar. Sur mobile, via la drawer.
Détail backend : `oto-backend/CLAUDE.md` §« Org/équipe : session vs maison vs consultation ».

**« Voir en tant que » (consultation USER, lecture seule).** Deux points d'entrée, même
mécanique : la fiche admin (`AdminUserView.vue`) ET, pour l'opérateur plateforme, un picker
de compte **dans la popin compte** (`AccountViewAs.vue` — recherche `getAdminUsers` +
client-filter, monté sous le switcher dans `ConsoleUserMenu`, gaté `isPlatformOperator`).
`setViewUser` (`lib/viewOrg.ts`) pose le header `X-Oto-View-As=<sub>` +
recharge sur `/console` → tout le dashboard rend la vue de ce user (sa maison suit). Bandeau
permanent `ViewAsBanner.vue` (monté dans `App.vue`) « tu vois en tant que X — quitter ». Entrer
efface la consultation org/équipe ; pas sur soi-même ; mutations rejetées backend (read-only).
REST-only, zéro effet MCP. ⚠️ **L'état d'un tiers (fiche admin) est calculé contre SON org
persistée, pas `current_org`** (qui renverrait le contexte du requérant) — cf. backend §ADR 0023.

## Hub compte (`/account`)

`AccountView.vue` = hub « gérer mon compte » (≠ ancien écran profil seul) : carte **profile**
(avatar/nom/email, `uploadAvatar`/`deleteAvatar`), carte **compte & accès** (email + rôle
plateforme en lecture seule + `logout`), carte **agent readme · toi** (`AgentReadmeCard`,
niveau USER — `GET/PUT /api/me/agent-readme`, injecté à chaque session après plateforme/org/
équipe), carte **cli & api tokens** (`AccountTokensCard.vue`, `getTokens`/`createToken`/
`deleteToken` — migrés depuis `ConnectorsView`, user-scopés). Pas de préférences/langue
(aucune infra i18n dans le repo).

## Observabilité (PostHog + Sentry)

- **PostHog** (`src/lib/analytics.ts`) — analytics produit + session replay, **gaté consentement RGPD**, no-op sans `VITE_POSTHOG_KEY`.
- **Sentry** (`src/lib/sentry.ts` → `@sentry/vue`) — **error tracking JS** : défauts code + erreurs de composant Vue. `initSentry(app)` dans `main.ts` (tôt, avant mount), no-op sans `VITE_SENTRY_DSN` (DSN **public** dans `.env.production`, projet front `oto-dashboard`, région EU `de.sentry.io`). **Pas** de tracing perf ni de replay (PostHog s'en charge) ; `sendDefaultPii=false`. Contexte user = `sub` Logto via `setSentryUser`, posé/effacé au login/logout (à côté d'`identifyUser`/`resetAnalytics`). Distinct du Sentry **backend** (projet `python-starlette`). Doctrine de triage côté oto : `surveillance-erreurs`.
  - **Source maps** : uploadées au build par `@sentry/vite-plugin` (`vite.config.ts`), actif **ssi `SENTRY_AUTH_TOKEN`** dans l'env de build (no-op en local/CI). Sur la box : token dans **`/opt/oto-dashboard/.build-env`** (chmod 600, `export …`), sourcé par `/opt/deploy/oto-dashboard.sh` avant `npm run build`. Maps en `hidden` (pas de `sourceMappingURL`) + supprimées du dist après upload → **non exposées** (le `.map` public = fallback SPA `index.html`, pas une vraie map). ⚠️ Le token posé est aujourd'hui le `sentry_api_token` **large** (SOPS) — à remplacer par un org-auth-token scopé `project:releases` (créable en UI Sentry) : swap = remplacer la valeur dans `.build-env`.

## Conventions

- API RESTful consommée sous `/api/*` (contrats : `oto-mcp/CLAUDE.md` §REST + `oto-app/docs/ORG_API_CONTRACT.md`)
- Composants dans `components/`, pages dans `views/`
- Pas de fichier > 500 lignes ; pas de fallback silencieux (lever une erreur)
- CORS : ajouter le domaine du dashboard à la whitelist oto-mcp (`OTO_MCP_CORS_ORIGINS` / défauts dans `api_routes.py`) avant tout déploiement
- ⚠️ **Avant push : typecheck avec la commande DU CI = `npx vue-tsc --build`** (script `type-check`, project references), PAS `--noEmit`. Le CI (`npm run build` → `run-p type-check …`) utilise `--build`, **plus strict** que `--noEmit` : un `--noEmit` local VERT peut être un `--build` CI ROUGE (vécu 2026-07-07 : `isPlatformOperator` utilisé dans un template sans import → `TS2339` seulement en `--build` → deploy dashboard bloqué pour tous). Purger le cache avant (`rm -f frontend/*.tsbuildinfo`). Le cache incrémental `tsbuildinfo` ne re-vérifie PAS les fichiers non touchés → un changement de nullabilité dans `types/api.ts` peut casser un consommateur ailleurs. Vécu 2026-06-22 (`AlphaInvite.email` passé nullable → `resendAlphaInvite` cassé).
  > **Second vecteur local-vert-CI-rouge : working tree ≠ arbre commité.** `vue-tsc` local compile le **working tree** ; le CI compile l'**arbre commité**. Sur ce tree partagé (`/data/oto`), le working tree porte souvent du WIP d'une session parallèle **ou** un correctif du linter non commité → le typecheck local passe alors que le commité casse. Corollaires : (a) après un `git add` large, vérifier qu'on n'a pas emporté un hunk étranger (retrait d'un symbole encore consommé par un fichier resté à l'ancienne version → build rouge) ; fix = `git checkout <sha-main> -- <fichier>` puis re-appliquer **seulement** ses ajouts additifs. (b) Si le CI pointe une ligne verte en local, comparer `git show HEAD:<fichier>` au working tree avant de conclure. Vécu 2026-07-02 (section Context : presets emportés + `ContextView.vue:45` corrigé par le linter mais non commité).

## Design system — règles front (DRY, non négociables)

Source de vérité visuelle : le DS **« Oto Console »** livré par JB Fleury, déposé dans
**`design-system/`** (brief `design-system/DESIGN-BRIEF.md` = le *pourquoi*, à lire d'abord ;
inventaire `design-system/readme.md` ; tokens `design-system/tokens/*.css` ; composants de
référence en JSX/`.d.ts`/`.prompt.md`/`*.card.html`). Le catalogue d'usage des classes
`console.css` reste `DESIGN.md` (racine). En cas de conflit repo ↔ brief, **le brief gagne**.
Skill dédiée : `.claude/skills/oto-frontend`.

Direction **« 2a »** : sidebar **encre** (`--sidebar-bg #2c2112`, texte crème ; actif = aplat
saffron), cartes chaudes (filet doux `#ede1bd` + `--shadow-card`, **jamais de bord noir**),
rayons **8px ou pill uniquement**, boutons **tous pill + casse normale**, typo Familjen Grotesk +
**Spline Sans Mono** (voix technique, retirer JetBrains Mono), icônes **Lucide** (`@lucide/vue`),
logo **« O ouvert »**.

- **Réutiliser avant d'écrire.** Toujours composer les classes `console.css` et les composants
  existants. Ne jamais redéfinir un style qui existe déjà.
- **Zéro valeur magique.** Couleurs, rayons, espacements, ombres, polices → uniquement via `var(--…)`.
  Rayons : `--radius-md` (8px) ou `--radius-pill`. Rien d'autre.
- **Accents = sens**, jamais décoratif. Icônes = Lucide, jamais de SVG dessiné à la main, jamais d'emoji.
- **Besoin récurrent (≥2×) manquant → créer un composant** dans le design system (documenté),
  puis l'utiliser. Étendre le système, jamais bricoler dans une vue.
- **Contraste** : petits libellés lisibles (mute `#675a3c`, faint `#6d603f`). Vérifier WCAG.
- Le DS est fourni en **React** : **porter en Vue**, ne pas copier les `.jsx` tels quels.
- Toute nouvelle vue rend **empty / error / loading** explicitement.

> **État d'intégration (poussé + déployé le 2026-07-04).**
> Faits : **b1** fondations tokens (couleurs WCAG, rayons md/pill, sidebar/ombres, Spline Sans
> Mono) · **b2** sidebar encre (item actif saffron) · **b3** retrait du lowercase forcé sur les
> boutons · **b4** champs (focus saffron, skin select natif, repli des classes ad-hoc sur `.inp` —
> variantes `.inp.sm`/`.inp:disabled` ajoutées) · **b5** icônes Lucide (`Icon.vue`, API inchangée) ·
> **b6** logo « O ouvert » (`lib/mark.ts`, `.o-medallion`) + favicons régénérés · **recapitalisation**
> des libellés de boutons (casse de phrase sur les CTA ; segmented/tabs/chips restent lowercase —
> voix « jeton »). Restent : **b7** composants manquants (Popover, SearchableSelect, Alert, Badge,
> Breadcrumb, Pagination, Accordion… — à porter au fil des besoins) · **b8** audit des scoped-styles
> (rayons magiques résiduels ; fait sur les composants partagés + 2 vues) · recapitaliser
> `ContextProfileCard`/`DataView`/`OrgView` (exclus le 04/07, WIP parallèle) · revue visuelle des
> écrans authentifiés (seul LoginGate vérifié au rendu). Plan : `design-system/handoff-alexis.md`.
