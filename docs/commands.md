---
title: Commandes & recettes de dev
type: reference
description: >-
  Lancer le dashboard en local, et la recette pour tester un fix contre les VRAIES données d
  e prod (env de production copié depuis .env.production, client SPA Logto qui autorise déjà
   localhost) plutôt que contre des fixtures inventées.
---

# Commandes & recettes de dev

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Tester un fix EN LOCAL contre les VRAIES données de prod (pas des fixtures)

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
