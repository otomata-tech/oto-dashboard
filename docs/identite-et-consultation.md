---
title: Identité & consultation
type: reference
description: >-
  Les deux surfaces distinctes depuis le 2026-07-03 (affichage en tête de sidebar, switch da
  ns la popin compte), la différence dure entre CONSULTATION et org MAISON (ADR 0023, zéro e
  ffet MCP depuis le front), le « voir en tant que » USER, et `/account`.
---

# Identité, consultation (view-as) et hub compte

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Identité — affichage (sidebar) + switch (popin compte)

Deux surfaces distinctes depuis le 2026-07-03 (pattern SaaS classique — le switch d'org
vit dans le menu compte, pas sur un badge cliquable) :
- **Affichage** : l'axe **identité** (« qui je suis » = sous quelle identité Claude agit :
  **compte (sub) × org active × équipe active**) vit en **tête de la sidebar**
  (`ConsoleIdentity.vue`, monté dans `ConsoleSidebar.vue`), **AFFICHAGE SEUL** (plus de clic
  → dialog). Logo org + nom + rôle + équipe, **s'adapte au niveau** (`useScope().level`) : en
  `org` il se recompose en **bannière org** ; kicker **« consultation »** quand l'org/équipe
  vue ≠ la maison.
- **Switch** : dans la **popin compte** (`ConsoleUserMenu.vue`, pied de sidebar). En tête de
  la popin, `WorkspaceSwitcher.vue` liste mes orgs + crée un workspace ; sous l'org courante,
  une ligne discrète de **chips d'équipe** — affichée **seulement si j'ai des équipes dans
  cette org** (`listGroups(orgId).filter(g => g.my_role != null)`), fini « toute l'org / aucune
  équipe » (dénué de sens pour les 95 % d'orgs sans équipe). Changer d'org m'y dépose dans MON
  équipe (la première). `IdentityDialog.vue` **supprimé** (son seul consommateur était le badge).

## Consultation (view-as) vs maison — ADR 0023

**Consultation (view-as) vs maison — ADR 0023 (clé à comprendre).** Choisir une org/équipe
dans le switcher est de la **CONSULTATION** : ça change seulement ce que le **dashboard** affiche,
**zéro effet MCP** (contrainte dure : jamais de bascule d'identité Claude depuis le FE — ça
casserait une conversation en cours). Mécanique : `lib/viewOrg.ts` pose les headers
`X-Oto-Org`/`X-Oto-Group` (persistés localStorage, injectés par `api()`/`apiUpload` →
`viewHeaders()`) ; le backend scope ses vues dessus sans rien persister. `setViewOrg`/
`setViewGroup` + `location.reload()` (les vues sont org/group-scopées). Changer d'org vue
efface l'équipe consultée (invariant).
- **org maison** (le défaut MCP) se règle par le **seul geste qui touche le MCP** :
  `setActiveOrg`/`useGroup` (REST = pose la maison). ⚠️ **Ce geste a quitté le switcher**
  (2026-07-03) — le switcher est consultation PURE, zéro écriture MCP ; « définir comme maison »
  migre vers la page **agent context** (« manage agent », en construction). `me.home_org`/
  `home_group` = défauts ; `me.active_org`/`active_group` = effectifs (consultation ?? maison).
- **identité d'action de Claude** = `oto_use_org`/`oto_use_group` **dans Claude** (override de
  session éphémère, retour maison à la conversation suivante). Le dashboard ne le règle jamais.
  Compte (sub) lecture seule (fixé par l'OAuth claude.ai).

Erreurs en **toast**. L'identité n'est PAS le level-switch du topbar. Sur mobile, via la drawer.
Détail backend : `oto-backend/CLAUDE.md` §« Org/équipe : session vs maison vs consultation ».

**« Voir en tant que » (consultation USER, lecture seule).** Deux points d'entrée, même
mécanique : la fiche admin (`AdminUserView.vue`) ET, pour l'opérateur plateforme, un picker
de compte **dans la popin compte** (`AccountViewAs.vue` — recherche `getAdminUsers` +
client-filter, monté sous le switcher dans `ConsoleUserMenu`, gaté `isPlatformOperator`).
`setViewUser` (`lib/viewOrg.ts`) pose le header `X-Oto-View-As=<sub>` +
recharge sur `/console` → tout le dashboard rend la vue de ce user (sa maison suit). Bandeau
permanent `ViewAsBanner.vue` (monté dans `App.vue`) « tu vois en tant que X — quitter ». Entrer
efface la consultation org/équipe ; pas sur soi-même ; mutations rejetées backend (read-only).
REST-only, zéro effet MCP. ⚠️ **L'état d'un tiers (fiche admin) est calculé contre SON org
persistée, pas `current_org`** (qui renverrait le contexte du requérant) — cf. backend §ADR 0023.

## Hub compte (`/account`)

`AccountView.vue` = hub « gérer mon compte » (≠ ancien écran profil seul) : carte **profile**
(avatar/nom/email, `uploadAvatar`/`deleteAvatar`), carte **compte & accès** (email + rôle
plateforme en lecture seule + `logout`), carte **agent readme · toi** (`AgentReadmeCard`,
niveau USER — `getInitGuide('user')`/`setInitGuide('user', …)`, injecté à chaque session
après plateforme/org/équipe), carte **cli & api tokens** (`AccountTokensCard.vue`, `getTokens`/`createToken`/
`deleteToken` — migrés depuis `ConnectorsView`, user-scopés). Pas de préférences/langue
(aucune infra i18n dans le repo).
