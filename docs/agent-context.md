---
title: Contexte de l'agent
type: reference
description: >-
  Le vocabulaire produit après l'unbundle 2026-07 : agent readme (injecté, cumulable, une se
  ule surface depuis ADR 0042), procédure (chargée à la demande, versionnée), guide (prose p
  late à la demande). Plus l'onboarding devenu un projet et la fiche profil.
---

# Ce que voit l'agent — readme, guides, procédures, profil

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Agent readme (ex-« doctrine de base ») — unbundlé des procédures (2026-07)

**Deux objets, deux mots, deux surfaces** (fin du bundle historique de l'écran doctrine) :
- **agent readme** = prose libre **injectée à chaque session** (bloc C backend), **cumulable
  par niveau** : plateforme (`/platform/instructions`) → org (`/org/context`) → équipe
  (`/team/context`, `GroupDoctrineCard`) → user (`/account/agent` + couche « ta note » de
  `/context`). Composant générique `AgentReadmeCard.vue` (props load/save). ⚠️ **UNE surface
  pour les 4 niveaux depuis le 28/07** (ADR 0042 §Convergence des surfaces) : un readme EST un
  guide dont la livraison est `init` → `getInitGuide(scope, ownerId?)` / `setInitGuide(...)`
  (`/api/me/guides/{scope}/readme?delivery=init`, ou `/api/{orgs,groups}/{id}/guides/…` pour
  une cible explicite). Fini les 4 chemins distincts (`agent-readme`, `instructions/claude_md`,
  `groups/{id}/instructions/claude_md`). **Toujours passer l'id** sur un écran qui gère une
  org/équipe précise : sans lui le backend vise celle ACTIVE en session, qui peut être une
  autre. (`/platform/instructions` garde sa surface admin propre — elle porte en plus le seed
  et le « rétablir le défaut ».) **Prose PLATE, sans versioning** (ADR 0042 : le readme vit dans `guides`, l'UI
  versions/restore retirée le 2026-07-06) — ≠ les PROCÉDURES nommées, qui gardent leur
  versioning (DoctrineView). Pas de compteur d'usage (l'injection n'est pas un tool
  call) — le tag dit « injecté à chaque session ».
- **procédure** (ex-skill / doctrine nommée) = déroulé opératoire **chargé à la demande**
  (`oto_get_doctrine(slug)`), publiable/forkable/partageable/liable à un projet.
- **guide** (ADR 0042, prose PLATE **chargée à la demande** via `oto_guide` — pendant du
  readme, mais pas injectée) = how-to éditable dans la console : `GuidesCard.vue` (créer/
  éditer/supprimer, éditeur + confirmation **inline**, jamais de dialog natif), montée dans
  la page « ce que voit ton agent » — scope **user** (`/context`, couche 2d) et **org**
  (`/org/context`, admin d'org) ; les guides **plateforme** y figurent en référence lecture
  seule. Client REST `getGuides`/`getGuide`/`setGuide`/`deleteGuide` (capacité backend
  `me.guides.*`, `/api/me/guides…`), types `Guide`/`GuideScope`.

## Onboarding = un projet (ADR 0032 §7, 2026-07-01)

> **Onboarding = un projet (ADR 0032 §7, 2026-07-01).** Plus d'écran « get started » ni de
> mode d'accueil spécial : le composant `GetStartedGuide.vue` et la variante `onboarding`
> d'`OverviewView` ont été retirés. L'accueil est le projet « Découverte » (sous `/projects`),
> semé à la création de l'org perso. `Me.onboarding` retiré. La fiche « situation avec oto »
> (profil) est entretenue par l'agent (`oto_profile`) **et** éditable dans la console : couche
> « ta fiche » de `/context` (`ContextProfileCard`, `GET/PUT /api/me/profile`) — même capacité
> `me.profile` des deux côtés (ADR 0042 §Convergence des surfaces, 28/07). Sa carte avait été
> débranchée par la refonte « anatomie en couches » (23/07) : couche en lecture seule, donc
> aucun moyen de corriger ce que l'agent y avait écrit. Remontée dans un slot `#profile-editor`.
