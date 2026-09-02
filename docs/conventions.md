---
title: Conventions du front
type: reference
description: >-
  Le typecheck du CI (`vue-tsc --build`, project references) et les deux vecteurs vécus de «
   local vert / CI rouge » : le cache incrémental qui ne re-vérifie pas les fichiers non tou
  chés, et le working tree ≠ arbre commité sur un checkout partagé. Plus la règle transverse
   « une alerte qui réclame un geste offre le moyen de l'accomplir », et son tripwire.
---

# Conventions du front

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Le typecheck — la commande DU CI, et les deux vecteurs de local-vert-CI-rouge

- ⚠️ **Avant push : typecheck avec la commande DU CI = `npx vue-tsc --build`** (script `type-check`, project references), PAS `--noEmit`. Le CI (`npm run build` → `run-p type-check …`) utilise `--build`, **plus strict** que `--noEmit` : un `--noEmit` local VERT peut être un `--build` CI ROUGE (vécu 2026-07-07 : `isPlatformOperator` utilisé dans un template sans import → `TS2339` seulement en `--build` → deploy dashboard bloqué pour tous). Purger le cache avant (`rm -f frontend/*.tsbuildinfo`). Le cache incrémental `tsbuildinfo` ne re-vérifie PAS les fichiers non touchés → un changement de nullabilité dans `types/api.ts` peut casser un consommateur ailleurs. Vécu 2026-06-22 (`AlphaInvite.email` passé nullable → `resendAlphaInvite` cassé).
  > **Second vecteur local-vert-CI-rouge : working tree ≠ arbre commité.** `vue-tsc` local compile le **working tree** ; le CI compile l'**arbre commité**. Sur ce tree partagé (`/data/oto`), le working tree porte souvent du WIP d'une session parallèle **ou** un correctif du linter non commité → le typecheck local passe alors que le commité casse. Corollaires : (a) après un `git add` large, vérifier qu'on n'a pas emporté un hunk étranger (retrait d'un symbole encore consommé par un fichier resté à l'ancienne version → build rouge) ; fix = `git checkout <sha-main> -- <fichier>` puis re-appliquer **seulement** ses ajouts additifs. (b) Si le CI pointe une ligne verte en local, comparer `git show HEAD:<fichier>` au working tree avant de conclure. Vécu 2026-07-02 (section Context : presets emportés + `ContextView.vue:45` corrigé par le linter mais non commité).

## ⚠️ Une alerte qui réclame un geste offre le moyen de l'accomplir

**Règle transverse, tous écrans.** Un cadre qui annonce un problème porte, dans le même
cadre, le geste qui le résout — ou nomme qui peut le faire. Sinon il n'informe pas : il
accuse. Une consigne sans exécution possible est pire qu'un silence, parce qu'elle est lue
avec confiance et qu'elle fait attendre un effet qui ne viendra pas.

**L'incident fondateur.** Sur `/org/billing`, **quatre** alertes de cette famille
coexistaient au 2026-09-02 : identité de facturation réclamée sans formulaire (le seul
abonné payant a lu la consigne **huit jours** sans pouvoir l'exécuter, et son prélèvement
suivant aurait échoué en silence) ; paiement en échec sans moyen de changer de carte ;
résiliation programmée sans retour arrière ; facture promise par les CGV, servie par l'API,
demandée par aucun écran. Ce n'était pas quatre oublis — c'était **une classe**.

Ce que la classe apprend, au-delà de ses cas :

- **On ferme la classe, pas le cas.** L'axe est « toute alerte de tout écran », pas « les
  alertes de la facturation ». Quatre correctifs se refont ; un contrôle tient.
- **Le levier n'est proposé qu'à qui peut s'en servir.** Quand le serveur réserve le geste,
  l'alerte **nomme qui peut agir** au lieu d'armer un bouton qui refuserait au clic — la
  même impasse, une porte plus loin (règle transverse « jamais de levier inerte » : un
  bouton hors droits est **omis**, jamais grisé).
- **Deux causes, deux traitements.** Un levier manque soit parce que l'écran l'a oublié
  (corrigeable ici), soit parce qu'**aucune surface serveur ne l'expose**. Le second n'est
  pas un lot de front : il se remonte à oto-backend au lieu d'être bricolé autour. C'est le
  cas des deux alertes qui restent aujourd'hui sans issue sur `/org/billing`
  (cf. `docs/facturation.md`) — il n'existe ni route de changement de moyen de paiement, ni
  inverse à `cancel`.

**Le contrôle** : `src/components/console/alerteLevier.tripwire.spec.ts`. Il énumère toutes
les alertes `<Notice tone="warn">` du dossier et exige que chacune porte un levier **dans son
cadre**, ou figure dans un registre avec sa raison — `informatif` (rien n'est demandé) ou
`levier-voisin` (le geste est immédiatement sous l'alerte, dans le même cadre). Une alerte
neuve que personne n'a classée fait rougir le test.

⚠️ **Ce que ce contrôle ne fait PAS**, et il ne faut pas le croire plus fort qu'il n'est : il
ne juge pas la qualité du levier — aucune analyse statique ne le peut. Il garantit seulement
que **la question a été posée** au moment où l'alerte est apparue. C'est précisément ce qui a
manqué pendant huit jours.
