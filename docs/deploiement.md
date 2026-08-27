---
title: Déploiement
type: reference
description: >-
  `main` = tronc = preprod (manage.oto.ninja) ; tag vX.Y.Z = prod (manage.oto.cx). Artefact-
  only, scripts serveur agnostiques au ref, tags immuables. Plus l'état du cutover ADR 0040 
  et la décommission de l'ancien account/.
---

# Déploiement — modèle tronc unique

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## État servi (post-cutover ADR 0040)

**Live en prod** : `manage.oto.cx` est servi par ce repo (`/opt/oto-dashboard/dist`) — post-cutover ADR 0040 (ex-`dashboard.oto.ninja`). L'ancien `account/` (oto-websites) **a été supprimé et décommissionné** (account.oto.zone, 2026-06-15) — le cutover est **fait**, plus de double-service. La migration des features (connecteurs, orgs, doctrine, admin, datastore) s'est faite écran par écran. Suivi : `otomata#20` + issues de ce repo.

## Modèle tronc unique (refonte 2026-07-20, ADR 0020)

> **Déploiement — modèle tronc unique (refonte 2026-07-20, ADR 0020).** `main` = tronc = **PREPROD** : push/merge sur `main` → « Deploy preprod » (`deploy-canari.yml`, build env VITE staging → `/opt/oto-dashboard-canari`, servi sur **`manage.oto.ninja`**). **PROD** = tag `vX.Y.Z` : `git tag vX.Y.Z && git push origin vX.Y.Z` → « Deploy prod » (`deploy.yml`, build au tag env VITE prod → `/opt/oto-dashboard/dist`, copie atomique + smoke + rollback). Artefact-only : les scripts serveur (`oto-dashboard-{canari-,}deploy.sh`) prennent un dist-dir, agnostiques au ref (seul le workflow change de ref). Tags `v*` immuables (ruleset). `guard-main`/`sync-main-to-canari` retirés ; branche `canari` dépréciée. Claude Code (web) ouvre ses PR sur `main` → preprod au merge.
