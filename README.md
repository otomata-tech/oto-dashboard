# oto-dashboard

The product dashboard for **oto-mcp** — account management, connectors, organizations,
groups, doctrines, billing and memory. It is the successor to the legacy `oto-app/account/`
SPA ([ADR 0007](https://github.com/otomata-tech/otomata/blob/main/docs/adr/0007-dashboard-repo-separe.md)),
served at `dashboard.oto.ninja`.

**There is no backend in this repo.** The dashboard's backend *is*
[oto-mcp](https://github.com/otomata-tech/oto-backend): the front talks to its REST API
(`https://mcp.oto.ninja/api/*`) with a Logto (ES384) JWT and holds no secrets of its own.

## Stack

- Vue 3 + Vite + TypeScript (`frontend/`), dev port **5192**
- [shadcn-vue](https://www.shadcn-vue.com/) (reka base, vega style, stone) + Tailwind CSS v4
- Otomata "Manuscrit chaud" design tokens in pure CSS — no `@otomata/ui` dependency.
  See [`DESIGN.md`](DESIGN.md) for the console design system.
- Auth: `@logto/browser` (PKCE) via `src/composables/useAuth.ts`
- API: `src/api.ts` — authenticated fetch against `VITE_OTO_MCP_BASE`

## What's inside

`frontend/src/views/console/` holds the console screens, grouped in the nav:

- **Overview / Connectors / Connector library** — connect credentials, browse the catalogue.
- **Organizations & groups** — orgs, departments with a team lead, shared secrets,
  toolset presets and doctrine.
- **Memory** — datastore (native PG tabular storage) and knowledge (Memento connection).
- **Billing** — per-org call-credit wallet (Stripe checkout).
- **Doctrine library** — marketplace of public doctrines (fork / publish).

The topbar carries an **MCP identity** badge (account × active org) showing which identity
Claude acts under when it calls tools.

## Commands

```bash
cd frontend && npm install
npm run dev            # Vite dev server on port 5192
npm run build          # vue-tsc + vite build → frontend/dist
```

`.env`: copy `frontend/.env.example`. `VITE_LOGTO_APP_ID` is a pre-created Logto SPA
client (no DCR) with redirects `https://<domain>/callback` + `http://localhost:5192/callback`.

## Status

Skeleton validated (Logto login + `GET /api/me`); features from the old `account/` SPA are
being migrated screen by screen. The legacy SPA stays in production until cutover.

See [`CLAUDE.md`](CLAUDE.md) for dev orientation and conventions, and the oto-mcp
[`docs/rest-api.md`](https://github.com/otomata-tech/oto-backend/blob/main/docs/rest-api.md)
for the API contracts.
