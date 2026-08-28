# oto-dashboard

Dashboard produit d'**oto-mcp** (gestion de compte, connecteurs, orgs, doctrine) — le successeur d'`oto-app/account/` ([ADR 0007](https://github.com/otomata-tech/otomata/blob/main/docs/adr/0007-dashboard-repo-separe.md)). Repo `otomata-tech/oto-dashboard`, local `/data/oto/oto-dashboard/`.

**Pas de `server/`** : le backend du dashboard EST oto-mcp (REST `https://mcp.oto.ninja/api/*`, JWT Logto ES384). Le front ne détient aucun secret (ADR 0004). C'est le seul écart au scaffold dev-init classique — ne pas ajouter de BFF sans décision explicite.

> **Ce fichier est une CARTE, pas un journal.** Il porte les conventions, les garde-fous
> et les pointeurs — ce qu'un agent doit avoir en tête à chaque session. L'inventaire des
> écrans, l'historique des refontes et les incidents datés vivent dans `docs/` — index en
> bas. **Un lot qui change un écran met à jour le doc du concept dans le même commit**, pas
> cette carte. Journal daté et récits d'incident migrés dans `docs/` le 2026-08-27.

## Stack (dev-init, moitié frontend)

- Vue 3 + Vite + TypeScript (`frontend/`), port dev **5192**
- shadcn-vue (base reka, style vega, stone) + Tailwind CSS v4 — composants dans `src/components/ui/`
- Tokens Otomata (« Manuscrit chaud ») en CSS pur — **aucune dépendance à @otomata/ui**.
  ⚠️ **Deux fichiers, ne pas confondre** : `src/assets/main.css` (`@theme`) ne déclare que
  les **6 couleurs de base** ; le **set complet** (surfaces, `-soft`/`-ink` des accents,
  `--ease-out`, classes `.o-medallion`/`.fadein`) vit dans **`src/assets/console.css`**.
  **Pour un écran console, piocher dans `console.css`** — détail : `docs/design-system.md`.
- **Design system console : `DESIGN.md`** (racine repo) — catalogue d'usage des classes `console.css` (shell, card, grilles, stats, tables, tags sémantiques, boutons, états empty/error/loading, checklist nouvel écran) + tableau « marketing vs console » (mêmes tokens, deux dialectes à ne pas transplanter). Tokens « Manuscrit chaud » communs : `@otomata/ui` `THEME.md`.
- Auth : `@logto/browser` (PKCE) via `src/composables/useAuth.ts` — interface `initAuth/login/logout/getAccessToken` ; `getAccessToken` lève `stale_session` sur token undefined (gotcha @logto)
- API : `src/api.ts` — fetch authentifié vers `VITE_OTO_MCP_BASE`
- **Types d'API = DÉRIVÉS, plus recopiés** : `src/types/api.generated.ts` est généré
  du document OpenAPI servi par oto-backend (snapshot `frontend/openapi/`), et
  `src/types/api.ts` n'en est plus qu'une couche d'**alias nommés**. Détail et
  commandes : `docs/types-api.md`.

## Commandes

```bash
cd frontend && npm install
honcho start            # ou : cd frontend && npm run dev (port 5192)
npm run build           # vue-tsc + vite build → frontend/dist

npm run api:check       # les types dérivés de l'OpenAPI ont-ils dérivé ? (le contrôle du CI)
npm run api:gen         # les régénérer depuis le snapshot commité
npm run api:refresh     # aller rechercher le document sur un backend VIVANT (prod par défaut)
```

`.env` : copier `frontend/.env.example` (VITE_LOGTO_APP_ID à créer via le skill `logto-client` — pas de DCR, client SPA pré-créé avec redirect `https://<domaine>/callback` + `http://localhost:5192/callback`).

Pour tester un fix contre les **vraies données de prod** plutôt que des fixtures (copier
l'env de `.env.production`, se logguer avec son vrai compte sur `localhost:5192`) :
**`docs/commands.md`**.

## Déploiement

**`main` = tronc = PREPROD** (`manage.oto.ninja`) ; **PROD = tag `vX.Y.Z`**
(`manage.oto.cx`, build au tag, copie atomique + smoke + rollback). Artefact-only : les
scripts serveur prennent un dist-dir, agnostiques au ref. Tags `v*` **immuables** (ruleset).
Claude Code (web) ouvre ses PR sur `main` → preprod au merge. **Détail : `docs/deploiement.md`.**

⚠️ **CORS** : ajouter le domaine du dashboard à la whitelist oto-mcp
(`OTO_MCP_CORS_ORIGINS` / défauts dans `api_routes.py`) avant tout déploiement — et c'est
bien **l'env des deux box** qui compte, il écrase la liste du code (cf.
`oto-backend/CLAUDE.md` §REST API).

## Carte des écrans

Un écran = une section de `consoleNav.ts` ; le détail (composants, API client, deep-links,
historique des refontes) vit dans le doc du concept.

| domaine | routes | doc |
|---|---|---|
| connecteurs (4 surfaces, hubs à onglets, fédération) | `/connectors`, `/org/connectors`, `/team/connectors`, `/platform/connectors` | `docs/connecteurs.md` |
| orgs, groupes/départements, invitations | `/org`, `/team`, `/platform/users` | `docs/orgs-groupes-invitations.md` |
| projets (index + page dédiée, partage navigable) | `/projects`, `/projects/:id`, `/import` | `docs/projets.md` |
| mémoire — datastore & knowledge | `/console/data`, `/documents` | `docs/datastore.md` |
| ce que voit l'agent — readme, guides, procédures, profil | `/context`, `/org/context`, `/team/context`, `/procedures` | `docs/agent-context.md` |
| recherche transverse (⌘K + page) | `/search` | `docs/recherche.md` |
| identité, consultation (view-as), hub compte | `/account` + sidebar/popin | `docs/identite-et-consultation.md` |
| écrans plateforme — objets possédés, tenants | `/platform/objects`, `/platform/tenants` | `docs/plateforme.md` |
| observabilité (PostHog + Sentry) | — | `docs/observabilite.md` |

Les **contrats backend** sont dans `oto-backend/` : `CLAUDE.md` pour la carte,
`docs/rest-api.md` pour l'inventaire REST.

## Règles transverses de l'UI

- ⚠️ **La consultation (view-as) n'a ZÉRO effet MCP.** Choisir une org/équipe dans le
  switcher change seulement ce que le **dashboard** affiche — contrainte dure : jamais de
  bascule d'identité Claude depuis le FE, ça casserait une conversation en cours. Le seul
  geste qui touche le MCP est « définir comme maison » (`setActiveOrg`/`useGroup`).
- ⚠️ **L'état d'un tiers (fiche admin) est calculé contre SON org persistée**, pas
  `current_org` (qui renverrait le contexte du requérant) — cf. `oto-backend` §ADR 0023.
- ⚠️ **`lib/keyStack.ts` est un MIROIR de `access.walk_cascade`** (backend) : aucun test ne
  relie les deux repos, donc une erreur n'y casse rien à l'écran — **elle fait mentir l'UI**
  (c'est elle qui annonce quelle clé prendrait le relais si l'user retire la sienne). Même
  régime pour `lib/tenantVerdict.ts` et `lib/connectorVerdict.ts`.
- ⚠️ **Jamais de levier inerte** : un pouvoir qu'un scope n'a pas ⇒ colonne/onglet **omis**,
  jamais affiché grisé.
- ⚠️ **Le formulaire de credential ne renvoie PAS un champ secret vide** (#126) : depuis
  le 27/08 le serveur complète les clés absentes et traite une clé vide comme un
  EFFACEMENT — renvoyer tout, comme avant, effacerait la clé qu'on voulait garder. Les
  règles (sélection des champs par mode, pré-remplissage, corps envoyé) vivent dans
  `lib/credentialForm.ts`, **miroir du serveur au même titre que `keyStack.ts`** : une
  erreur n'y casse pas l'écran, elle écrit au coffre autre chose que ce qui est affiché.
  Détail : `docs/connecteurs.md`.
- ⚠️ **Copy user-facing = verbatim** (`lib/connectorVerdict.ts` porte la copy du CDC), jamais
  reformulée. i18n FR complète, 0 terme banni.
- ⚠️ Les identifiants de code/API gardent le mot « doctrine » (`Doctrine*View`,
  `getDoctrine`, `/api/me/instructions*`) — seul le **vocabulaire produit** (routes, copy)
  est passé à « procédure » / « agent readme ».

## Conventions

- API RESTful consommée sous `/api/*` (contrats : `oto-mcp/CLAUDE.md` §REST + `oto-app/docs/ORG_API_CONTRACT.md`)
- ⚠️ **On n'écrit plus de type d'API à la main.** Les contrats du backend se DÉRIVENT
  du document OpenAPI (`npm run api:gen`) ; `src/types/api.ts` ne porte que des alias
  nommés vers le généré. Un champ manquant ou faux se corrige **côté oto-backend**
  (déclarer ou resserrer l'`Output` de la capacité), puis `npm run api:refresh` ici —
  jamais en retouchant le type côté front. Les rares interfaces encore écrites à la
  main portent leur raison en commentaire (admin hors document · `Output` non déclaré ·
  contrat plus lâche que l'écran). Chaîne, contrôles CI et état mesuré :
  **`docs/types-api.md`**.
- Composants dans `components/`, pages dans `views/`
- Pas de fichier > 500 lignes ; pas de fallback silencieux (lever une erreur)
- ⚠️ **Avant push : typecheck avec la commande DU CI = `npx vue-tsc --build`** (script
  `type-check`, project references), PAS `--noEmit` : `--build` est **plus strict**, un
  `--noEmit` local VERT peut être un `--build` CI ROUGE. Purger le cache avant
  (`rm -f frontend/*.tsbuildinfo`) — l'incrémental ne re-vérifie PAS les fichiers non touchés.
- ⚠️ **Second vecteur local-vert-CI-rouge : working tree ≠ arbre commité.** `vue-tsc` local
  compile le working tree, le CI compile le commité — et ce tree est partagé
  (`/data/oto`). Après un `git add` large, vérifier qu'on n'a pas emporté un hunk étranger ;
  si le CI pointe une ligne verte en local, comparer `git show HEAD:<fichier>` au working tree
  avant de conclure. Les deux incidents vécus : `docs/conventions.md`.

## Design system — règles front (DRY, non négociables)

**L'identité Otomata se définit dans `oto-studio/brand/`** (repo public `otomata-tech/oto-studio`)
et s'implémente pour les frontends dans **`@otomata/ui`** — règle de la plateforme : un nouveau
frontend prend les tokens par `import "@otomata/ui/src/theme.css"`. ⚠️ **Le dashboard n'y est pas
branché** : ses tokens sont écrits en dur dans `console.css` (ADR 0007) et le branchement est un
lot à part, à décider — ne pas l'improviser. Le catalogue d'usage des classes `console.css` reste
`DESIGN.md` (racine). Skill dédiée : `.claude/skills/oto-frontend`. Direction « 2a », tokens, état
d'intégration et **note datée sur l'archivage de `design-system/` (2026-08-27)** :
**`docs/design-system.md`**.

- **Réutiliser avant d'écrire.** Toujours composer les classes `console.css` et les composants
  existants. Ne jamais redéfinir un style qui existe déjà.
- **Zéro valeur magique.** Couleurs, rayons, espacements, ombres, polices → uniquement via `var(--…)`.
  Rayons : `--radius-md` (8px) ou `--radius-pill`. Rien d'autre.
- **Accents = sens**, jamais décoratif. Icônes = Lucide, jamais de SVG dessiné à la main, jamais d'emoji.
- **Besoin récurrent (≥2×) manquant → créer un composant** dans le design system (documenté),
  puis l'utiliser. Étendre le système, jamais bricoler dans une vue.
- **Contraste** : petits libellés lisibles (mute `#675a3c`, faint `#6d603f`). Vérifier WCAG.
- Toute nouvelle vue rend **empty / error / loading** explicitement.
- **Jamais de dialog natif** (`window.prompt`/`confirm`/`alert`) : éditeur + confirmation inline.

## Docs

| doc | ce qu'il porte |
|---|---|
| `commands.md` | lancer le dashboard, et tester un fix en local contre les **vraies données de prod**. |
| `deploiement.md` | modèle tronc unique (`main` = preprod, tag `vX.Y.Z` = prod), artefact-only, cutover ADR 0040. |
| `conventions.md` | le typecheck du CI (`vue-tsc --build`) et les deux vecteurs vécus de « local vert / CI rouge ». |
| `design-system.md` | où vit l'identité (`oto-studio/brand/` → `@otomata/ui`) et pourquoi le dashboard ne s'y branche pas encore, direction « 2a », les deux fichiers de tokens, état d'intégration b1→b8, archivage de `design-system/`. |
| `handoff-design-system.md` | le plan de portage du DS dans le front (b1→b8) — **historique**. |
| `refonte-pages-projet.md` | cahier des charges de la refonte UX des pages Projet/Projets — **historique** : les pages visées seront celles du nouveau front. |
| `connecteurs.md` | le moteur unique `connector-scope` (4 surfaces), la présentation verdict-first, les 3 projections ADR 0022, la carte-shell, le compte partagé, la fédération MCP, les hubs à onglets. |
| `orgs-groupes-invitations.md` | départements (ADR 0012) et invitations en feature cascade aux 3 niveaux. |
| `projets.md` | index + page `/projects/:id`, slots & inventaire dérivé (ADR 0035), partage navigable `<slug>.share.oto.cx` et « Ajouter à mon Oto ». |
| `datastore.md` | grille server-driven, vue fiches aux mêmes verbes que la table, deeplink par id, ownership ADR 0030, partage unifié. |
| `agent-context.md` | agent readme (injecté, cumulable, UNE surface depuis ADR 0042), procédures, guides, onboarding devenu un projet, fiche profil. |
| `recherche.md` | popup ⌘K + page `/search`, un seul chemin de rendu, deep-link `?doc=`, backlinks, boîte « À traiter ». |
| `identite-et-consultation.md` | affichage (sidebar) vs switch (popin compte), consultation vs maison (ADR 0023), « voir en tant que » USER, hub `/account`. |
| `plateforme.md` | `/platform/objects` (objets possédés, ADR 0030) et `/platform/tenants` (ADR 0052, lecture seule, verdict « redémarrage requis »). |
| `types-api.md` | la chaîne `Output` → OpenAPI → snapshot → types générés → alias, les deux contrôles CI, et ce qui reste écrit à la main (avec pourquoi). |
| `observabilite.md` | PostHog (gaté consentement) + Sentry `@sentry/vue`, source maps au build, token à scoper. |
