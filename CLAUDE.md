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

## État / feuille de route

**Live en prod** : `dashboard.oto.ninja` est servi par ce repo (`/opt/oto-dashboard/dist`, deploy CI `deploy.yml`), `app.oto.ninja` redirige dessus (302). L'ancien `account/` (oto-websites) **a été supprimé et décommissionné** (account.oto.zone, 2026-06-15) — le cutover est **fait**, plus de double-service. La migration des features (connecteurs, orgs, doctrine, admin, datastore) s'est faite écran par écran. Suivi : `otomata#20` + issues de ce repo.

## Groupes / départements (ADR 0012)

Section `/console/groups` (`GroupsView.vue` + `GroupDoctrineCard.vue`) : départements d'une org avec **chef d'équipe** (`group_admin`). Un membre bascule son **groupe actif** (`useGroup` → `PUT /api/me/active-group`) ; le chef (ou un org_admin) gère membres, **secrets partagés** (résolus avant ceux de l'org), **preset de toolset** (baseline de visibilité) et **doctrine** de groupe. Hiérarchie de droits côté backend (`roles.py`, escalade descendante) — l'UI masque seulement les contrôles. `Me` porte `active_group`/`active_group_name`/`group_role` ; `ProviderStatus.mode` peut valoir `group` (libellé « team key »). Contrats : `oto-backend/docs/groups-and-roles.md`.

## Connecteurs — surface unifiée (connexion + outils, 3 états)

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
La carte dit en clair **quelle clé résout** (`status.mode` → « ta clé perso / la clé de ton org /
la clé plateforme oto »). Les toggles d'outils restent `enableTool`/`disableTool`. Les **presets**
de toolbox vivent en bas de la même vue. Les **tokens CLI** ont migré vers le **hub compte**
(`/account`, `AccountTokensCard.vue`) — user-scopés (`/api/me/tokens`).

> **Carte = shell partagé (ADR 0024 §3).** `ConnectorCardShell.vue` porte le chrome commun
> (logo/nom/badges/corps) ; la projection USER le remplit via `ConnectorCard` (connexion +
> outils), la projection ORG via `ConnectorOrgCard` (gouvernance). Même identité visuelle.

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
- **PLATEFORME** `/platform/connectors` (`AdminConnectorsView`) — master switch + **clé plateforme**
  (set/remove inline, réservé super_admin ; absorbe l'ex-`/platform/keys`, qui redirige). Entitlements
  de namespace restent par org dans `/platform/orgs`.

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

> **Partage public CHIFFRÉ (ADR 0032 §3, zero-knowledge).** `ProjectDetailView` porte une carte
> « lien public · chiffré » : à la publication, le navigateur assemble un snapshot (brief + pages
> via `listDocs`), le **chiffre** (`lib/crypto.ts`, WebCrypto AES-256-GCM, clé neuve) et n'envoie
> que le ciphertext (`publishProjectShare`) ; la clé part dans le **fragment** du lien
> (`/p/p/<token>#<clé>`), copié au presse-papier. Le lien complet est mémorisé en `localStorage`
> (`oto:pshare:<id>`) pour le ré-afficher (la clé n'existe QUE côté client → sinon re-publier).
> Viewer public `PublicProjectView.vue` (route `/p/p/:token`, hors shell, sans auth) : lit la clé
> du hash, `getPublicProjectShare` → `decryptShare` → rend brief + arbre de pages (`MarkdownView`).
> `Project.public_shared`/`public_shared_at` viennent du `get` backend. Pendant chiffré du viewer
> public de doc (#4a, `PublicDocView` / `/p/d/:token`).

## Mémoire — datastore + knowledge (ADR 0016)

Groupe nav **« memory »** (`consoleNav.ts`) = deux surfaces de mémoire :
- **Datastore** (`/console/data`, `DataView.vue`) — stockage tabulaire, **substrat PG natif** (plus Google Sheets). Grille **server-driven** (`DataTable.vue` : tri/recherche/pagination côté API via `getNamespaceRows({offset,limit,order_by,order_dir,q})`, rendu cellules typé `cellRender.ts`) ; clic row → détail/édition (`RowDrawer.vue`). **Deeplink par id** (`?ns=<id>`, `NamespaceEntry.id` BIGSERIAL stable → le **renommage** ne casse pas l'URL). **Ownership ADR 0030** : les droits viennent du payload (`can_write`/`can_govern`/`owner_type`), plus de `isOwner` dérivé du flag `shared` ; read-only = `can_write===false`, boutons share/rename/transfer/delete gatés par `can_govern`. **org-owned activé** : la création propose un scope (perso / classeur d'org active) via `promptForm` select → `createNamespace(ns, {type:'org', id})` ; badge « org »/« team » sur la liste. **share** (`ShareDialog.vue`), **rename**, **transfer** (l'ancien proprio repasse en grant write). Plus de gate Google.
- **Knowledge** (`/console/knowledge`, `KnowledgeView.vue`) — connexion **Memento opt-in** (réutilise `getMementoStatus`/`startMementoOauth`/`disconnectMemento`, mêmes endpoints que la carte federated mcp de `ConnectorsView`) ; pas de browse des KB (déféré). Retour OAuth `?memento=connected|error`.

## Connecteurs & doctrines — point d'entrée à onglets (découverte fusionnée)

Le groupe nav « library » a **disparu** : les bibliothèques (découverte) sont fusionnées
en **onglets** des pages de gestion `/connectors` et `/doctrine`, chacune devenue un
**point d'entrée unique** à onglets (`SubTabs.vue`, état porté par `?tab=` via `useDeepLink`).
Onglet par défaut = `mine` (`?tab` absent = URL propre). Les ex-routes `/library/connectors`
et `/library/doctrines` **redirigent** vers `…?tab=marketplace` (`router/index.ts`).

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
- **`/doctrine`** = host `DoctrineHubView.vue`, 2 onglets :
  - `mine` — `DoctrineView.vue` (doctrine de base + skills de l'org/équipe, édition/versions/usage).
  - `marketplace` — `DoctrineLibraryView.vue` : doctrines publiques avec **auteur** (badge
    « Otomata » ou org créatrice), recherche + filtres auteur/topic, preview markdown,
    **fork** dans l'org active (org_admin), unpublish conditionnel. API `listLibraryDoctrines`/
    `getLibraryDoctrine`/`forkLibraryDoctrine`/`unpublishDoctrine`. `DoctrineView.vue` garde
    l'action **« publier »** d'un skill (org_admin → `publishDoctrine`). Backend :
    `oto-backend/CLAUDE.md` §REST (capacités `library.*`).

Les hosts montent leurs panneaux en `v-if` (lazy `defineAsyncComponent`, chunks préservés) ;
chaque panneau garde son propre deep-link (`?doc=`, `?preview=`) qui coexiste avec `?tab=`.

## Identité — en-tête du menu (org + équipe active)

L'axe **identité** (« qui je suis » = sous quelle identité Claude agit : **compte (sub) ×
org active × équipe active**) vit en **tête de la sidebar** (`ConsoleIdentity.vue`, monté
dans `ConsoleSidebar.vue` à la place de l'ancien brand « oto / console »), **plus dans le
topbar** (le badge a été retiré le 2026-06-22 : on le cherchait là où on regarde — le menu).
Il affiche logo org + nom + rôle + équipe, et **s'adapte au niveau** (`useScope().level`) :
en `org` il se recompose en **bannière org** ; affiche **« consultation »** quand l'org/équipe
vue ≠ la maison. Clic → `IdentityDialog.vue` (« organisation & équipe »).

**Consultation (view-as) vs maison — ADR 0023 (clé à comprendre).** Choisir une org/équipe
dans la modale est de la **CONSULTATION** : ça change seulement ce que le **dashboard** affiche,
**zéro effet MCP**. Mécanique : `lib/viewOrg.ts` pose les headers `X-Oto-Org`/`X-Oto-Group`
(persistés localStorage, injectés par `api()`/`apiUpload` → `viewHeaders()`) ; le backend
scope ses vues dessus sans rien persister. `setViewOrg`/`setViewGroup` + `location.reload()`
(les vues sont org/group-scopées). Changer d'org vue efface l'équipe consultée (invariant).
- **org maison** (le défaut MCP) se règle par le **seul geste qui touche le MCP** : « définir
  comme maison » (inline sur la ligne consultée) → `setActiveOrg`/`useGroup` (REST = pose la
  maison) puis efface la consultation. `me.home_org`/`home_group` = défauts ; `me.active_org`/
  `active_group` = effectifs (consultation ?? maison). Badge « maison » d'équipe gaté sur
  `viewingHomeOrg` (la home_group appartient à la maison, pas à une org consultée).
- **identité d'action de Claude** = `oto_use_org`/`oto_use_group` **dans Claude** (override de
  session éphémère, retour maison à la conversation suivante). La modale le **rappelle**, elle
  ne le règle pas. Compte (sub) lecture seule (fixé par l'OAuth claude.ai).

Erreurs en **toast**. L'identité n'est PAS le level-switch du topbar. Sur mobile, via la drawer.
Détail backend : `oto-backend/CLAUDE.md` §« Org/équipe : session vs maison vs consultation ».

**« Voir en tant que » (consultation USER, lecture seule).** Bouton sur la fiche admin
(`AdminUserView.vue`) → `setViewUser` (`lib/viewOrg.ts`) pose le header `X-Oto-View-As=<sub>` +
recharge sur `/console` → tout le dashboard rend la vue de ce user (sa maison suit). Bandeau
permanent `ViewAsBanner.vue` (monté dans `App.vue`) « tu vois en tant que X — quitter ». Entrer
efface la consultation org/équipe ; pas sur soi-même ; mutations rejetées backend (read-only).
REST-only, zéro effet MCP. ⚠️ **L'état d'un tiers (fiche admin) est calculé contre SON org
persistée, pas `current_org`** (qui renverrait le contexte du requérant) — cf. backend §ADR 0023.

## Hub compte (`/account`)

`AccountView.vue` = hub « gérer mon compte » (≠ ancien écran profil seul) : carte **profile**
(avatar/nom/email, `uploadAvatar`/`deleteAvatar`), carte **compte & accès** (email + rôle
plateforme en lecture seule + `logout`), carte **cli & api tokens** (`AccountTokensCard.vue`,
`getTokens`/`createToken`/`deleteToken` — migrés depuis `ConnectorsView`, user-scopés). Pas de
préférences/langue (aucune infra i18n dans le repo).

## Observabilité (PostHog + Sentry)

- **PostHog** (`src/lib/analytics.ts`) — analytics produit + session replay, **gaté consentement RGPD**, no-op sans `VITE_POSTHOG_KEY`.
- **Sentry** (`src/lib/sentry.ts` → `@sentry/vue`) — **error tracking JS** : défauts code + erreurs de composant Vue. `initSentry(app)` dans `main.ts` (tôt, avant mount), no-op sans `VITE_SENTRY_DSN` (DSN **public** dans `.env.production`, projet front `oto-dashboard`, région EU `de.sentry.io`). **Pas** de tracing perf ni de replay (PostHog s'en charge) ; `sendDefaultPii=false`. Contexte user = `sub` Logto via `setSentryUser`, posé/effacé au login/logout (à côté d'`identifyUser`/`resetAnalytics`). Distinct du Sentry **backend** (projet `python-starlette`). Doctrine de triage côté oto : `surveillance-erreurs`.
  - **Source maps** : uploadées au build par `@sentry/vite-plugin` (`vite.config.ts`), actif **ssi `SENTRY_AUTH_TOKEN`** dans l'env de build (no-op en local/CI). Sur la box : token dans **`/opt/oto-dashboard/.build-env`** (chmod 600, `export …`), sourcé par `/opt/deploy/oto-dashboard.sh` avant `npm run build`. Maps en `hidden` (pas de `sourceMappingURL`) + supprimées du dist après upload → **non exposées** (le `.map` public = fallback SPA `index.html`, pas une vraie map). ⚠️ Le token posé est aujourd'hui le `sentry_api_token` **large** (SOPS) — à remplacer par un org-auth-token scopé `project:releases` (créable en UI Sentry) : swap = remplacer la valeur dans `.build-env`.

## Conventions

- API RESTful consommée sous `/api/*` (contrats : `oto-mcp/CLAUDE.md` §REST + `oto-app/docs/ORG_API_CONTRACT.md`)
- Composants dans `components/`, pages dans `views/`
- Pas de fichier > 500 lignes ; pas de fallback silencieux (lever une erreur)
- CORS : ajouter le domaine du dashboard à la whitelist oto-mcp (`OTO_MCP_CORS_ORIGINS` / défauts dans `api_routes.py`) avant tout déploiement
- ⚠️ **Avant push : typecheck PROPRE** (`rm -f frontend/*.tsbuildinfo; cd frontend && npx vue-tsc --noEmit`). Le cache incrémental `tsbuildinfo` ne re-vérifie PAS les fichiers non touchés → un changement de nullabilité dans `types/api.ts` peut casser un consommateur ailleurs (`vue-tsc` local vert) tandis que le **build propre du CI** (job `test`) le rejette. Vécu 2026-06-22 (`AlphaInvite.email` passé nullable → `resendAlphaInvite` cassé).
