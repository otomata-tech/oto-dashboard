---
title: Observabilité (front)
type: reference
description: >-
  PostHog (analytics produit + session replay, gaté consentement RGPD) et Sentry (@sentry/vu
  e, error tracking JS), avec l'upload des source maps au build et le token à remplacer par 
  un org-auth-token scopé.
---

# Observabilité (PostHog + Sentry)

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Les deux outils

- **PostHog** (`src/lib/analytics.ts`) — analytics produit + session replay, **gaté consentement RGPD**, no-op sans `VITE_POSTHOG_KEY`.
- **Sentry** (`src/lib/sentry.ts` → `@sentry/vue`) — **error tracking JS** : défauts code + erreurs de composant Vue. `initSentry(app)` dans `main.ts` (tôt, avant mount), no-op sans `VITE_SENTRY_DSN` (DSN **public** dans `.env.production`, projet front `oto-dashboard`, région EU `de.sentry.io`). **Pas** de tracing perf ni de replay (PostHog s'en charge) ; `sendDefaultPii=false`. Contexte user = `sub` Logto via `setSentryUser`, posé/effacé au login/logout (à côté d'`identifyUser`/`resetAnalytics`). Distinct du Sentry **backend** (projet `python-starlette`). Doctrine de triage côté oto : `surveillance-erreurs`.
  - **Source maps** : uploadées au build par `@sentry/vite-plugin` (`vite.config.ts`), actif **ssi `SENTRY_AUTH_TOKEN`** dans l'env de build (no-op en local/CI). Sur la box : token dans **`/opt/oto-dashboard/.build-env`** (chmod 600, `export …`), sourcé par `/opt/deploy/oto-dashboard.sh` avant `npm run build`. Maps en `hidden` (pas de `sourceMappingURL`) + supprimées du dist après upload → **non exposées** (le `.map` public = fallback SPA `index.html`, pas une vraie map). ⚠️ Le token posé est aujourd'hui le `sentry_api_token` **large** (SOPS) — à remplacer par un org-auth-token scopé `project:releases` (créable en UI Sentry) : swap = remplacer la valeur dans `.build-env`.
