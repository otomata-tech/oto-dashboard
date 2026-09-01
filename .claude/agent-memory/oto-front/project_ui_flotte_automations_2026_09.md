---
name: ui-flotte-automations-2026-09
description: Chantier /automations (09/2026) — surveillance + fiche d'agent livrées ; oto-backend PR #723 sert les 3 données qui manquaient, consommée en avance via un fichier de types TEMPORAIRE à supprimer au déploiement
metadata:
  type: project
---

Le 2026-09-01, Alexis a jugé l'UI flotte/automations « ultra sommaire » et demandé une
**partie monitoring** et une **fiche complète d'un agent**. Livrées, puis reprises le même
jour pour consommer trois données que le backend s'est mis à servir.

**Why:** l'écran servait le grain ordonnanceur (« où en est CE travail ») mais pas la
question qu'on se pose pendant qu'une campagne tourne — « est-ce que ça va bien ».

## L'état à retenir : une PR backend OUVERTE, consommée en avance

**oto-backend PR #723** (`feat/servir-le-travail-des-agents`) sert `_claimed_run` sur les
lignes, `lease_until` sur `op=list`/`get`, et déclare les trois postes de garde. Elle est
**ouverte, ni mergée ni déployée**. Le front la consomme déjà, via
**`frontend/src/types/api.attendu.ts`** — un fichier de types écrit à la main, à part,
parce que `npm run api:refresh` interroge le backend **en ligne** et l'effacerait.

**How to apply:** au déploiement de #723 → `npm run api:refresh`, vérifier que le document
régénéré porte les champs, basculer les usages sur les types générés, **supprimer
`api.attendu.ts`**. C'est un sas, pas une exception permanente à la règle « on n'écrit plus
de type d'API à la main ». Tant qu'elle n'est pas déployée, **ne pas régénérer les types**
en pensant rattraper un retard : on effacerait le contrat.

## Ce qui reste impossible, et qu'on n'invente pas

**Relier un travail CONCLU à la ligne qu'il a travaillée.** `_claimed_run` répond « sur
quelle ligne ce run est-il MAINTENANT », jamais « laquelle a-t-il travaillée » : la colonne
est effacée à la libération. L'écran le **dit** au lieu de laisser un silence, qui se lirait
« ce travail n'a touché aucune ligne ». Le lien pour les travaux conclus est un lot du
dépôt **`oto-runner`**, qu'Alexis prend de son côté — ne pas le refaire ici.

Reste aussi hors de portée : le **volume visé** d'une campagne (il vit dans la déclaration
de flotte, non exposée), d'où des dénominateurs exacts mais partiels.

Détail technique, pièges et contrats : `oto-dashboard/docs/automations.md` et
`docs/datastore.md`. Leçons de méthode : [[ecran-muet-est-une-hypothese]],
[[signal-de-garde-jamais-noye]].
