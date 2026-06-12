# oto-dashboard

Dashboard produit d'**oto-mcp** (gestion de compte, connecteurs, orgs, doctrine) — le successeur d'`oto-app/account/` ([ADR 0007](https://github.com/otomata-tech/otomata/blob/main/docs/adr/0007-dashboard-repo-separe.md)). Repo `otomata-tech/oto-dashboard`, local `/data/oto/oto-dashboard/`.

**Pas de `server/`** : le backend du dashboard EST oto-mcp (REST `https://mcp.oto.ninja/api/*`, JWT Logto ES384). Le front ne détient aucun secret (ADR 0004). C'est le seul écart au scaffold dev-init classique — ne pas ajouter de BFF sans décision explicite.

## Stack (dev-init, moitié frontend)

- Vue 3 + Vite + TypeScript (`frontend/`), port dev **5192**
- shadcn-vue (base reka, style vega, stone) + Tailwind CSS v4 — composants dans `src/components/ui/`
- Tokens Otomata (« Manuscrit chaud ») en CSS pur dans `src/assets/main.css` (`@theme`) — **aucune dépendance à @otomata/ui**
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

Squelette validé (login Logto + `GET /api/me` affiché). La migration des features d'`account/` (connecteurs, orgs, doctrine, admin, datastore) se fait écran par écran ; `account/` reste servi en prod jusqu'au cutover (bascule du dist Caddy). Suivi : `otomata#20` + issues de ce repo.

## Conventions

- API RESTful consommée sous `/api/*` (contrats : `oto-mcp/CLAUDE.md` §REST + `oto-app/docs/ORG_API_CONTRACT.md`)
- Composants dans `components/`, pages dans `views/`
- Pas de fichier > 500 lignes ; pas de fallback silencieux (lever une erreur)
- CORS : ajouter le domaine du dashboard à la whitelist oto-mcp (`OTO_MCP_CORS_ORIGINS` / défauts dans `api_routes.py`) avant tout déploiement
