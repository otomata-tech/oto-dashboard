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

## Billing / credits (paiement Stripe)

Section `/console/billing` (`BillingView.vue`) : portefeuille de credits d'appel **par org active**. 1 appel MCP = 1 credit ; chaque org reçoit un stock de base gratuit, puis recharge par **packs Stripe** (paiement ponctuel — `POST /api/me/billing/checkout` → redirect `checkout_url`). Soft : le solde peut être négatif, l'appel n'est jamais bloqué (drapeau `low`). Le solde vit dans `me.billing` (`{balance, low, base_granted}`, `null` si pas d'org active) — pas de fetch dédié pour l'afficher. Packs/historique via `getBillingPacks`/`getBillingTransactions`. Retour de Checkout : `?status=success|cancel` → toast + `reload()` du `me`. Achat ouvert à tout membre (recharge le wallet partagé). Backend : `oto-backend/CLAUDE.md` §Billing.
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

La carte dérive sa face credential des champs du registre (`ConnectorMeta`) : keyé
(`credential_fields`) → formulaire inline (`setCredential`) ; oauth/cookie/hosted →
elle pointe (`@goto`) vers la carte dédiée ancrée plus bas (`#sessions`/`#google`/
`#federated`/`#messaging`). Les toggles d'outils par connecteur restent `enableTool`/
`disableTool`. Les **presets** de toolbox vivent en bas de la même vue. Les **tokens CLI**
ont migré vers le **hub compte** (`/account`, `AccountTokensCard.vue`) — ils sont
user-scopés (`/api/me/tokens`), pas org-scopés comme les connecteurs.

## Fédération MCP (memento, otomata#16)

`ConnectorsView.vue` porte la carte « federated mcp » (connect/disconnect du compte memento
per-user, OAuth via `/api/memento/oauth/*`). Depuis 2026-06-17 la fédération memento est
**systématique** côté oto-mcp (connecteur `self_serve`, monté d'office) → la carte s'affiche
pour **tous** les users (plus seulement les entitled). `OverviewView` ajoute une étape
d'onboarding « connect your knowledge base » (auto-prompt) tant que `me.memento.connected` est
faux. `Me.memento` (`{connected, set_at}`) vient de `GET /api/me`. Le compte memento est
provisionné automatiquement à la création du compte oto (côté backend).

## Mémoire — datastore + knowledge (ADR 0016)

Groupe nav **« memory »** (`consoleNav.ts`) = deux surfaces de mémoire :
- **Datastore** (`/console/data`, `DataView.vue`) — stockage tabulaire per-user, **substrat PG natif** (plus Google Sheets) ; liste/crée des namespaces, badge « shared ». `getNamespaces` renvoie des `NamespaceEntry` (objets, pas des strings). Plus de gate Google.
- **Knowledge** (`/console/knowledge`, `KnowledgeView.vue`) — connexion **Memento opt-in** (réutilise `getMementoStatus`/`startMementoOauth`/`disconnectMemento`, mêmes endpoints que la carte federated mcp de `ConnectorsView`) ; pas de browse des KB (déféré). Retour OAuth `?memento=connected|error`.

## Bibliothèque — connecteurs & doctrines (groupe nav « library »)

Deux surfaces de **découverte** (≠ gestion), groupe nav `library` (`consoleNav.ts`) :
- **Connector library** (`/console/connector-library`, `ConnectorLibraryView.vue`) — catalogue
  navigable de tous les connecteurs : logo de l'éditeur (`ConnectorMeta.logo_url`, monogramme de
  repli) + `publisher`, recherche (nom/éditeur/namespace), filtres par `category`, tags `family`.
  Données = `getConnectors()` (même `/api/connectors` que la vitrine). La connexion d'un credential
  reste sur `/console/connectors`.
- **Doctrine library** (`/console/doctrine-library`, `DoctrineLibraryView.vue`) — marketplace de
  doctrines publiques : chaque entrée a un **auteur** (badge « Otomata » ou nom de l'org créatrice),
  recherche + filtres auteur/topic, preview markdown, **fork** dans l'org active (org_admin),
  unpublish conditionnel. API `listLibraryDoctrines`/`getLibraryDoctrine`/`forkLibraryDoctrine`/
  `unpublishDoctrine`. `DoctrineView.vue` ajoute l'action **« publier »** d'un skill (org_admin →
  `publishDoctrine`). Backend : `oto-backend/CLAUDE.md` §REST (capacités `library.*`).

## Identité — en-tête du menu (org + équipe active)

L'axe **identité** (« qui je suis » = sous quelle identité Claude agit : **compte (sub) ×
org active × équipe active**) vit en **tête de la sidebar** (`ConsoleIdentity.vue`, monté
dans `ConsoleSidebar.vue` à la place de l'ancien brand « oto / console »), **plus dans le
topbar** (le badge a été retiré le 2026-06-22 : on le cherchait là où on regarde — le menu).
Il affiche logo org + nom + rôle + équipe, et **s'adapte au niveau** (`useScope().level`) :
en `org` il se recompose en **bannière org** (logo plus grand, accent saffron) — c'est le
« le menu s'adapte en mode gérer mon org ». Clic → `IdentityDialog.vue` (modale) :
- **compte** (email + rôle, **lecture seule** — le sub est fixé par l'OAuth claude.ai, juste
  un HOWTO « reconnecte le connecteur dans claude.ai » ; édition du profil/avatar = `/account`).
- **org active** (Perso/orgs/créer) → `setActiveOrg`/`clearActiveOrg`/`createMyOrg`.
- **équipe active** (groupes de l'org active, visible si org active) → `useGroup`/`clearActiveGroup`,
  liste via `listGroups`. Toute bascule fait `location.reload()` (vues org/group-scopées).

Erreurs en **toast**. L'identité n'est PAS le level-switch du topbar (axe gouvernance « mon
espace/org/plateforme », masqué en mobile). Sur mobile, l'identité s'atteint via la drawer.

**Découplage clé à comprendre** : changer l'org/équipe ici règle le **défaut des prochaines
conversations** Claude. Une conversation **déjà ouverte** ne se met pas à jour depuis le
dashboard (connexion MCP séparée) — sauf via `oto_use_org <org>` **dans** Claude, qui
recharge la toolbox live (fix backend `refresh_visibility`, cf. `oto-backend/CLAUDE.md`
§Visibility). Les credentials, eux, basculent toujours immédiatement.

## Hub compte (`/account`)

`AccountView.vue` = hub « gérer mon compte » (≠ ancien écran profil seul) : carte **profile**
(avatar/nom/email, `uploadAvatar`/`deleteAvatar`), carte **compte & accès** (email + rôle
plateforme en lecture seule + `logout`), carte **cli & api tokens** (`AccountTokensCard.vue`,
`getTokens`/`createToken`/`deleteToken` — migrés depuis `ConnectorsView`, user-scopés). Pas de
préférences/langue (aucune infra i18n dans le repo).

## Conventions

- API RESTful consommée sous `/api/*` (contrats : `oto-mcp/CLAUDE.md` §REST + `oto-app/docs/ORG_API_CONTRACT.md`)
- Composants dans `components/`, pages dans `views/`
- Pas de fichier > 500 lignes ; pas de fallback silencieux (lever une erreur)
- CORS : ajouter le domaine du dashboard à la whitelist oto-mcp (`OTO_MCP_CORS_ORIGINS` / défauts dans `api_routes.py`) avant tout déploiement
- ⚠️ **Avant push : typecheck PROPRE** (`rm -f frontend/*.tsbuildinfo; cd frontend && npx vue-tsc --noEmit`). Le cache incrémental `tsbuildinfo` ne re-vérifie PAS les fichiers non touchés → un changement de nullabilité dans `types/api.ts` peut casser un consommateur ailleurs (`vue-tsc` local vert) tandis que le **build propre du CI** (job `test`) le rejette. Vécu 2026-06-22 (`AlphaInvite.email` passé nullable → `resendAlphaInvite` cassé).
