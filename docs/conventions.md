---
title: Conventions du front
type: reference
description: >-
  Le typecheck du CI (`vue-tsc --build`, project references) et les deux vecteurs vécus de «
   local vert / CI rouge » : le cache incrémental qui ne re-vérifie pas les fichiers non tou
  chés, et le working tree ≠ arbre commité sur un checkout partagé.
---

# Conventions du front

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Le typecheck — la commande DU CI, et les deux vecteurs de local-vert-CI-rouge

- ⚠️ **Avant push : typecheck avec la commande DU CI = `npx vue-tsc --build`** (script `type-check`, project references), PAS `--noEmit`. Le CI (`npm run build` → `run-p type-check …`) utilise `--build`, **plus strict** que `--noEmit` : un `--noEmit` local VERT peut être un `--build` CI ROUGE (vécu 2026-07-07 : `isPlatformOperator` utilisé dans un template sans import → `TS2339` seulement en `--build` → deploy dashboard bloqué pour tous). Purger le cache avant (`rm -f frontend/*.tsbuildinfo`). Le cache incrémental `tsbuildinfo` ne re-vérifie PAS les fichiers non touchés → un changement de nullabilité dans `types/api.ts` peut casser un consommateur ailleurs. Vécu 2026-06-22 (`AlphaInvite.email` passé nullable → `resendAlphaInvite` cassé).
  > **Second vecteur local-vert-CI-rouge : working tree ≠ arbre commité.** `vue-tsc` local compile le **working tree** ; le CI compile l'**arbre commité**. Sur ce tree partagé (`/data/oto`), le working tree porte souvent du WIP d'une session parallèle **ou** un correctif du linter non commité → le typecheck local passe alors que le commité casse. Corollaires : (a) après un `git add` large, vérifier qu'on n'a pas emporté un hunk étranger (retrait d'un symbole encore consommé par un fichier resté à l'ancienne version → build rouge) ; fix = `git checkout <sha-main> -- <fichier>` puis re-appliquer **seulement** ses ajouts additifs. (b) Si le CI pointe une ligne verte en local, comparer `git show HEAD:<fichier>` au working tree avant de conclure. Vécu 2026-07-02 (section Context : presets emportés + `ContextView.vue:45` corrigé par le linter mais non commité).
