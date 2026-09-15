# oto-dashboard

Dashboard produit d'**oto-backend** (compte, connecteurs, orgs, projets, mémoire, automatisations, facturation,
plateforme) — ADR 0007. Repo `otomata-tech/oto-dashboard`, local `/data/oto/oto-dashboard/`.

**Pas de `server/`** : le backend du dashboard EST oto-backend (REST `/api/*`, JWT Logto ES384). Le front ne détient
aucun secret (ADR 0004). C'est le seul écart au scaffold dev-init — **pas de BFF sans décision explicite**.

> **Carte, pas journal.** Les inventaires d'écrans, l'historique et les incidents vivent dans `docs/` (index en bas).
> **Un lot qui change un écran met à jour le doc du concept dans le même commit**, pas cette carte.

## Stack

- Vue 3 + Vite + TypeScript (`frontend/`), port dev **5192** · shadcn-vue (base reka, style vega, stone) + Tailwind v4
- Tokens « Manuscrit chaud » en CSS pur, **sans dépendance à `@otomata/ui`** : `src/assets/main.css` (`@theme`, les 6
  couleurs de base) et **`src/assets/console.css`** (le set complet — c'est là qu'on pioche pour un écran console).
  Catalogue d'usage : `DESIGN.md` (racine). Détail : `docs/design-system.md`.
- Auth : `@logto/browser` (PKCE) via `src/composables/useAuth.ts` ; `getAccessToken` lève `stale_session`.
- API : `src/api.ts` (fetch authentifié vers `VITE_OTO_MCP_BASE`). Types **dérivés** de l'OpenAPI servi par oto-backend
  (`src/types/api.generated.ts`, snapshot `frontend/openapi/`) ; `src/types/api.ts` n'est qu'une couche d'alias.

## Commandes

```bash
cd frontend && npm install
honcho start            # ou : npm run dev (port 5192)
npm run build           # vue-tsc --build + vite build → frontend/dist
npm run test            # vitest

npm run api:check       # les types dérivés de l'OpenAPI ont-ils dérivé ? (le contrôle du CI)
npm run api:gen         # les régénérer depuis le snapshot commité
npm run api:refresh     # aller rechercher le document sur un backend VIVANT (prod par défaut)
npm run schema:check    # les attributs de schéma lus ici == ceux que la plateforme déclare ?
```

`.env` : copier `frontend/.env.example` (`VITE_LOGTO_APP_ID` via le skill `logto-client` — pas de DCR, client SPA
pré-créé). Tester un fix contre les **vraies données de prod** : `docs/commands.md`.

## Déploiement

**`main` = PREPROD** (`manage.oto.ninja`) ; **PROD = tag `vX.Y.Z`** (`manage.oto.cx` — build au tag, copie atomique +
smoke + rollback, tags `v*` immuables). Détail : `docs/deploiement.md`.

⚠️ **CORS** : la liste du code est morte, c'est `OTO_MCP_CORS_ORIGINS` dans l'env **des deux box** qui fait foi — y
ajouter le domaine du dashboard **avant** tout déploiement.

## Les écrans

Un écran = une section de **`lib/consoleNav.ts`** — la nav fait foi, on ne la recopie pas ici. Le détail d'un domaine
(composants, API client, deep-links) vit dans son doc ; les contrats backend dans `oto-backend/docs/rest-api.md`.
Les anciennes routes sont des redirections dans `router/index.ts`.

## Règles de l'UI

**Liste complète : `docs/regles-ui.md`** (une phrase par règle, l'incident dans le doc du concept).
Les quatre qui coûtent le plus cher quand on les ignore :

- **La consultation (view-as) n'a ZÉRO effet MCP** : le switcher change ce que le dashboard affiche, jamais l'identité
  de Claude ; le seul geste qui touche le MCP est « définir comme maison ».
- **Les miroirs du serveur** (`lib/keyStack.ts`, `credentialForm.ts`, `tenantVerdict.ts`, `connectorVerdict.ts`,
  `datastoreClaims.ts`) : aucun test ne relie les deux repos, une erreur n'y casse pas l'écran, **elle fait mentir
  l'UI** ; toute évolution se fait des deux côtés.
- **Jamais de levier inerte, jamais d'alerte sans levier** : un pouvoir qu'un scope n'a pas est **omis**, pas grisé ;
  un message qui nomme un geste porte le geste dans la même phrase, ou nomme qui peut agir.
- **Un rôle ne vaut pas droit d'écrire** : un geste d'écriture lit `canAdministerOrg`/`canWriteInOrg` (`useMe`), jamais
  le rôle seul — en consultation le serveur refuse tout, super_admin compris.

## Conventions

- **On n'écrit plus de type d'API à la main** : un champ manquant ou faux se corrige côté oto-backend (déclarer ou
  resserrer l'`Output`), puis `npm run api:refresh` ici. → `docs/types-api.md`
- **Attributs de schéma de tableau : les deux côtés se confrontent, aucun ne se recopie.** `npm run schema:check`
  dérive l'interface `DatastoreField` d'un côté, `GET /api/datastore/schema/keys` de l'autre, et refuse les deux
  écarts. ⚠️ Ajouter un attribut au rendu sans le faire déclarer côté backend le rend **invisible à la validation**,
  donc candidat au retrait comme mort. `frontend/scripts/schema-keys-dette.txt` porte la dette connue : **elle ne doit
  que décroître**, rien ne s'y ajoute sans décision.
- ⚠️ **Avant push, le typecheck DU CI** : `npx vue-tsc --build` (pas `--noEmit`, moins strict), après
  `rm -f frontend/*.tsbuildinfo` ; et le CI compile l'arbre **COMMITÉ**, pas le working tree partagé — comparer
  `git show HEAD:<fichier>` avant de conclure. → `docs/conventions.md`

## Design system

L'identité Otomata se définit dans `oto-studio/brand/` et s'implémente pour les frontends dans `@otomata/ui`.
⚠️ **Le dashboard n'y est pas branché** : ses tokens sont écrits en dur dans `console.css` (ADR 0007) et **le
branchement est un lot à part, à décider — ne pas l'improviser**. Skill dédiée : `.claude/skills/oto-frontend`.
Règles front : `docs/regles-ui.md` §Design system · sources et état d'intégration : `docs/design-system.md`.

## Docs

Un doc par domaine, sous `docs/` : `regles-ui.md` · `commands.md` · `deploiement.md` · `conventions.md` ·
`design-system.md` · `connecteurs.md` · `orgs-groupes-invitations.md` · `projets.md` · `datastore.md` ·
`agent-context.md` · `recherche.md` · `identite-et-consultation.md` · `plateforme.md` · `facturation.md` ·
`automations.md` · `types-api.md` · `observabilite.md`.
Historiques (ne décrivent pas l'état courant) : `handoff-design-system.md`, `refonte-pages-projet.md`.
