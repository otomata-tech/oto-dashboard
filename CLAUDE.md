# oto-dashboard

Dashboard produit d'**oto-backend** (compte, connecteurs, orgs, procédures, mémoire, facturation, plateforme) — successeur de l'ancien `account/` d'oto-websites ([ADR 0007](https://github.com/otomata-tech/oto-private/blob/main/docs/adr/0007-dashboard-repo-separe.md)). Repo `otomata-tech/oto-dashboard`, local `/data/oto/oto-dashboard/`.

**Pas de `server/`** : le backend du dashboard EST oto-backend (REST `https://mcp.oto.ninja/api/*`, JWT Logto ES384). Le front ne détient aucun secret (ADR 0004). C'est le seul écart au scaffold dev-init classique — pas de BFF sans décision explicite.

> **Ce fichier est une CARTE, pas un journal.** Il dit où vit quoi, les règles en vigueur
> et les pointeurs. Les inventaires d'écrans, l'historique et les incidents datés — avec ce
> qu'ils ont appris — vivent dans `docs/` (index en bas). **Un lot qui change un écran met
> à jour le doc du concept dans le même commit**, pas cette carte.

## Stack (dev-init, moitié frontend)

- Vue 3 + Vite + TypeScript (`frontend/`), port dev **5192**
- shadcn-vue (base reka, style vega, stone) + Tailwind CSS v4 — composants dans `src/components/ui/`
- Tokens « Manuscrit chaud » en CSS pur, **sans dépendance à `@otomata/ui`**. Deux fichiers : `src/assets/main.css` (`@theme`, les 6 couleurs de base) et **`src/assets/console.css`** (le set complet — c'est là qu'on pioche pour un écran console). Catalogue d'usage des classes : `DESIGN.md` (racine). Détail : `docs/design-system.md`.
- Auth : `@logto/browser` (PKCE) via `src/composables/useAuth.ts` — `initAuth/login/logout/getAccessToken` ; `getAccessToken` lève `stale_session` sur token absent.
- API : `src/api.ts` — fetch authentifié vers `VITE_OTO_MCP_BASE`.
- Types d'API **dérivés** de l'OpenAPI servi par oto-backend (`src/types/api.generated.ts`, snapshot `frontend/openapi/`) ; `src/types/api.ts` n'est qu'une couche d'alias nommés. Détail : `docs/types-api.md`.

## Commandes

```bash
cd frontend && npm install
honcho start            # ou : cd frontend && npm run dev (port 5192)
npm run build           # vue-tsc --build + vite build → frontend/dist
npm run test            # vitest

npm run api:check       # les types dérivés de l'OpenAPI ont-ils dérivé ? (le contrôle du CI)
npm run api:gen         # les régénérer depuis le snapshot commité
npm run api:refresh     # aller rechercher le document sur un backend VIVANT (prod par défaut)
```

`.env` : copier `frontend/.env.example` (`VITE_LOGTO_APP_ID` via le skill `logto-client` — pas de DCR, client SPA pré-créé avec redirect `https://<domaine>/callback` + `http://localhost:5192/callback`). Tester un fix contre les **vraies données de prod** : `docs/commands.md`.

## Déploiement

**`main` = PREPROD** (`manage.oto.ninja`) ; **PROD = tag `vX.Y.Z`** (`manage.oto.cx` — build au tag, copie atomique + smoke + rollback, tags `v*` immuables). Détail : `docs/deploiement.md`.

⚠️ **CORS** : la liste du code est morte, c'est `OTO_MCP_CORS_ORIGINS` dans l'env **des deux box** qui fait foi — y ajouter le domaine du dashboard avant tout déploiement (cf. `oto-backend/CLAUDE.md` §CORS).

## Carte des écrans

Un écran = une section de `lib/consoleNav.ts` ; le détail (composants, API client, deep-links, historique) vit dans le doc du concept ; contrats backend : `oto-backend/CLAUDE.md` (carte) et `oto-backend/docs/rest-api.md` (inventaire REST). Les anciennes routes (`/doctrine`, `/toolbox`, `/knowledge`, `/library/*`, `/group`, `/org/departments`…) sont des redirections dans `router/index.ts`.

| domaine | routes | doc |
|---|---|---|
| vue d'ensemble, monitoring, réglages et sécurité d'org | `/overview`, `/org/monitoring`, `/org/settings`, `/org/security`, `/platform/monitoring` | — (pas de doc dédié) |
| connecteurs (4 surfaces, hubs à onglets, fédération) | `/connectors`, `/org/connectors`, `/team/connectors`, `/platform/connectors` | `docs/connecteurs.md` |
| orgs, équipes, invitations, fiches admin | `/org`, `/org/teams`, `/team`, `/platform/users` (+ `/:sub`), `/platform/orgs` (+ `/:id`) | `docs/orgs-groupes-invitations.md` |
| projets (index + page dédiée, partage navigable) | `/projects`, `/projects/:id`, `/import` | `docs/projets.md` |
| mémoire — datastore & knowledge | `/data`, `/data/:id` (+ `/item/:rowId`), `/documents` (hors sidebar) | `docs/datastore.md` |
| ce que voit l'agent — readme, guides, procédures | `/context`, `/org/context`, `/team/context`, `/platform/context`, `/procedures`, `/procedures/:id`, `/team/procedures` | `docs/agent-context.md` |
| recherche transverse (⌘K + page) | `/search` | `docs/recherche.md` |
| identité, consultation (view-as), hub compte | `/account/*`, `/activity` + sidebar/popin | `docs/identite-et-consultation.md` |
| écrans plateforme — objets possédés, tenants, relance des comptes inactifs | `/platform/objects`, `/platform/tenants`, `/platform/outreach` | `docs/plateforme.md` |
| facturation — abonnement, tunnel de souscription, factures | `/org/billing` | `docs/facturation.md` |
| automatisations — file d'exécution, déclencheurs, routines | `/automations` | `docs/automations.md` |
| observabilité (PostHog + Sentry) | — | `docs/observabilite.md` |

## Règles de l'UI

Une phrase par règle ; l'incident qui l'a produite et ses cas limites vivent dans le doc pointé.

- **La consultation (view-as) n'a ZÉRO effet MCP** : le switcher change ce que le dashboard affiche, jamais l'identité de Claude ; le seul geste qui touche le MCP est « définir comme maison » (`setActiveOrg`/`useGroup`). → `docs/identite-et-consultation.md`
- **L'état d'un tiers (fiche admin) se calcule contre SON org persistée**, pas `current_org` (qui renverrait le contexte du requérant). → `docs/identite-et-consultation.md`
- **Les miroirs du serveur** — `lib/keyStack.ts` (↔ `access.walk_cascade`), `lib/credentialForm.ts`, `lib/tenantVerdict.ts`, `lib/connectorVerdict.ts`, `lib/datastoreClaims.ts` : aucun test ne relie les deux repos, une erreur n'y casse pas l'écran, **elle fait mentir l'UI** ; toute évolution se fait des deux côtés. → `docs/connecteurs.md`, `docs/plateforme.md`, `docs/datastore.md`
- **Jamais de levier inerte** : un pouvoir qu'un scope n'a pas ⇒ colonne/onglet **omis**, jamais affiché grisé.
- **Jamais d'alerte sans levier** (la règle symétrique) : un message qui nomme un geste porte le geste dans la même phrase, ou nomme qui peut agir ; un formulaire posé dans un tunnel doit aussi vivre APRÈS le tunnel. Tripwire : `alerteLevier.tripwire.spec.ts`. → `docs/conventions.md`, `docs/facturation.md`
- **Un secret conservé est OMIS du corps** du formulaire de credential : le serveur traite une clé présente et vide comme un effacement. → `docs/connecteurs.md`
- **Un paiement RÉUSSI ne produit jamais de copie négative** : les branches de `confirm` sont des 200 discriminées par `status`, `pending_mandate` est une attente, et aucun bouton de paiement n'est atteignable pendant l'attente. → `docs/facturation.md`
- **Les horodatages du backend arrivent en UTC sans fuseau** : toute lecture de date passe par `instant()` (`lib/runnerJobs.ts`), jamais par `Date.parse` nu. → `docs/automations.md`
- **Une page absente de `PAGE_META` retombe silencieusement sur l'overview** ; `lib/consoleNav.spec.ts` tient la règle (tout écran a son titre, tout titre ses deux traductions). → `docs/automations.md`
- **Copy user-facing = verbatim** (`lib/connectorVerdict.ts` porte la copy du CDC), jamais reformulée ; i18n FR complète.
- **Un droit d'ÉCRITURE ne se déduit pas d'un droit d'ADMINISTRATION** : chaque geste lit le drapeau de SON geste (`lib/instructionRights.ts`) ; `can_edit` n'est qu'un repli quand le serveur est plus ancien. → `docs/orgs-groupes-invitations.md`
- **`set_by` est un identifiant de compte, pas un nom** : il s'affiche via `lib/accountLabel.ts` — nom, à défaut adresse, à défaut l'identifiant, jamais l'inverse. → `docs/conventions.md`
- Les identifiants de code/API gardent le mot « doctrine » (`Doctrine*View`, `getDoctrine`, `/api/me/instructions*`) ; seul le vocabulaire produit (routes, copy) dit « procédure » / « agent readme ». → `docs/agent-context.md`

## Conventions

- API RESTful consommée sous `/api/*` (contrats : `oto-backend/docs/rest-api.md` + `oto-websites/docs/ORG_API_CONTRACT.md`).
- **On n'écrit plus de type d'API à la main** : un champ manquant ou faux se corrige côté oto-backend (déclarer ou resserrer l'`Output`), puis `npm run api:refresh` ici. Les interfaces encore manuelles portent leur raison en commentaire ; `src/types/api.attendu.ts` est un sas temporaire pour ce qu'une PR backend ouverte sert déjà. → `docs/types-api.md`
- Composants dans `components/`, pages dans `views/` ; pas de fichier > 500 lignes ; pas de fallback silencieux (lever une erreur).
- **Avant push, le typecheck DU CI** : `npx vue-tsc --build` (pas `--noEmit`, moins strict), après `rm -f frontend/*.tsbuildinfo` ; et le CI compile l'arbre COMMITÉ, pas le working tree partagé — comparer `git show HEAD:<fichier>` avant de conclure. → `docs/conventions.md`

## Design system — règles front (DRY, non négociables)

L'identité Otomata se définit dans `oto-studio/brand/` et s'implémente pour les frontends dans `@otomata/ui` (`import "@otomata/ui/src/theme.css"`). ⚠️ **Le dashboard n'y est pas branché** : ses tokens sont écrits en dur dans `console.css` (ADR 0007) et **le branchement est un lot à part, à décider — ne pas l'improviser**. Skill dédiée : `.claude/skills/oto-frontend`. Sources, direction « 2a », état d'intégration : `docs/design-system.md`.

- **Réutiliser avant d'écrire** : composer les classes `console.css` et les composants existants, ne jamais redéfinir un style qui existe.
- **Zéro valeur magique** : couleurs, rayons, espacements, ombres, polices → `var(--…)` uniquement. Rayons : `--radius-md` ou `--radius-pill`, rien d'autre.
- **Accents = sens**, jamais décoratif. Icônes = Lucide ; jamais de SVG dessiné à la main, jamais d'emoji.
- **Besoin récurrent (≥2×) manquant → un composant** dans le design system, documenté, puis utilisé. Étendre le système, jamais bricoler dans une vue.
- **Contraste** : petits libellés en `--color-mute`/`--color-faint` (lisibles WCAG sur crème), vérifier.
- Toute nouvelle vue rend **empty / error / loading** explicitement.
- **Jamais de dialog natif** (`window.prompt`/`confirm`/`alert`) : éditeur + confirmation inline.

## Docs

| doc | ce qu'il porte |
|---|---|
| `commands.md` | lancer le dashboard, tester un fix en local contre les vraies données de prod. |
| `deploiement.md` | tronc unique (`main` = preprod, tag = prod), artefact-only, cutover ADR 0040. |
| `conventions.md` | le typecheck du CI et ses deux vecteurs de « local vert / CI rouge » ; les règles transverses « alerte sans levier » (avec son tripwire) et « un identifiant de compte s'affiche en personne », avec leurs incidents. |
| `design-system.md` | où vit l'identité et pourquoi le dashboard ne s'y branche pas encore, direction « 2a », les deux fichiers de tokens, état d'intégration, archivage de `design-system/`. |
| `handoff-design-system.md` | plan de portage du DS dans le front (b1→b8) — **historique**. |
| `refonte-pages-projet.md` | cahier des charges de la refonte UX des pages Projet — **historique**. |
| `connecteurs.md` | moteur unique `connector-scope` (4 surfaces), verdict-first, 3 projections ADR 0022, carte-shell, compte partagé, multi-compte, formulaire de credential, fédération MCP, hubs à onglets. |
| `orgs-groupes-invitations.md` | départements (ADR 0012), droits par geste sur les procédures d'équipe, invitations en cascade aux 3 niveaux. |
| `projets.md` | index + page `/projects/:id`, slots & inventaire dérivé (ADR 0035), partage navigable `<slug>.share.oto.cx`. |
| `datastore.md` | grille server-driven, vue fiches, deeplink par id, ownership ADR 0030, partage unifié, file de travail et run qui tient une ligne. |
| `agent-context.md` | agent readme (injecté, cumulable, ADR 0042), procédures, guides, onboarding devenu projet, fiche profil. |
| `recherche.md` | popup ⌘K + page `/search`, un seul chemin de rendu, deep-link `?doc=`, backlinks, boîte « À traiter ». |
| `identite-et-consultation.md` | affichage (sidebar) vs switch (popin), consultation vs maison (ADR 0023), « voir en tant que », hub `/account`. |
| `plateforme.md` | `/platform/objects` (ADR 0030), `/platform/tenants` (ADR 0052, lecture seule), `/platform/outreach` (les cinq verrous vivent au serveur). |
| `facturation.md` | `/org/billing` et son tunnel, `pending_mandate` = attente, l'alerte qui porte son levier, factures, préalables peints d'un coup, miroir de TVA. |
| `automations.md` | surveillance de flotte, file d'exécution (grain ordonnanceur), fiche d'un agent, contrat ouvert de `RunnerJob['result']`, pièges vécus (listes lues comme des compteurs, `null` = non mesuré, `lease_until`, UTC, `PAGE_META`). |
| `types-api.md` | chaîne `Output` → OpenAPI → snapshot → types → alias, les deux contrôles CI, ce qui reste manuel, le sas `api.attendu.ts`. |
| `observabilite.md` | PostHog (gaté consentement) + Sentry, source maps au build, token à scoper. |
