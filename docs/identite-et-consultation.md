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
`/api/me` décrit alors le compte vu, dont `active_org_readonly` vaut faux : c'est
**`view_as_read_only`** qui annonce la lecture seule (oto#212), et `canWriteInOrg` refuse
l'écriture sur l'un OU l'autre. Le front ne la déduit ni de l'en-tête ni d'un état local.
REST-only, zéro effet MCP. ⚠️ **L'état d'un tiers (fiche admin) est calculé contre SON org
persistée, pas `current_org`** (qui renverrait le contexte du requérant) — cf. backend §ADR 0023.

**Écrire en tant que (24/09/2026, décision d'Alexis).** La vue reste en lecture seule par
défaut. Au **super_admin** seulement, le bandeau offre « Écrire en tant que <cible> » : une
confirmation intégrée (`usePrompt`, jamais un dialogue natif) dit que chaque modification sera
faite au nom de la cible et journalisée « par <opérateur> en tant que <cible> », visible par son
organisation. Acceptée, chaque requête porte en plus `X-Oto-View-As-Write: 1` (`viewHeaders`) et
le bandeau passe en mode écriture, avec « Revenir en lecture seule ». L'acceptation vit **en
mémoire** (`writeAcceptedFor`, `lib/viewOrg.ts`) : elle tombe au rechargement, en quittant la vue
et en changeant de cible. Le rôle de l'opérateur est **figé à l'entrée** (`ViewUser.operator`,
posé par `AdminUserView`) parce que `/api/me` rend alors la cible : c'est un indice d'affichage,
le serveur reste l'autorité (403 `view_as_write_forbidden` hors super_admin, 403
`view_as_read_only` sans acceptation — ce refus rouvre la confirmation, via
`viewAsWriteRequests`). Le **droit d'écrire** de l'écran ne se tire pas de cet état local : à
l'acceptation comme au retour en lecture seule, le bandeau relit `/api/me`, dont le serveur passe
`view_as_read_only` à faux quand l'écriture est acceptée (oto#212) ; les gestes (`canWriteInOrg`)
apparaissent alors. Avec un backend antérieur, le champ reste vrai et les gestes restent masqués
après acceptation. Une vue posée avant ce lot n'a pas d'`operator` : pas de bouton, il suffit
de la reprendre depuis la fiche admin.

**Voir en tant que, borné à l'org (oto#270, 25/09/2026, décision d'Alexis).** Un org_admin
RÉEL (la colonne `org_role`, hors consultation) a, sur chaque autre membre de la liste des
membres (`OrgView`), un bouton « voir en tant que » — omis sur un membre que le serveur dit
opérateur plateforme (`is_platform_operator`, servi à l'org_admin ; `null` = non servi, le
bouton reste et le serveur tranche). Entrer pose l'org dans `ViewUser.org` (`lib/viewOrg.ts`),
qui ne sert qu'à l'en-tête : chaque requête porte alors `X-Oto-View-As` ET `X-Oto-Org` = cette org —
jamais une autre, même si l'URL en consulte une —, et jamais `X-Oto-View-As-Write` (le
serveur refuse l'écriture, `view_as_write_forbidden` : elle reste au super_admin). Le bandeau
dit « tu vois ce que voit X dans <org>, en lecture seule », sans offre d'écriture ; « quitter »
ramène à `/org`. Si le serveur refuse d'ouvrir la vue (`/api/me` en `400 view_as_org_required`,
`403 view_as_hors_org` — cible opérateur plateforme ou plus membre —, `403 forbidden` — plus
admin), le bandeau le dit.
Le serveur sert cette vue sur une liste FERMÉE de lectures, refuse le reste en `403
view_as_hors_org`, et **le dit lui-même sur `/api/me`** : `view_as_bound_org` (l'org de la
vue ; `null` hors vue bornée, y compris en vue d'opérateur) et `view_as_refused_prefixes` (les
préfixes des lectures GET refusées, dérivés de ce que son middleware applique). **Le front n'en
recopie rien** (`lib/vueBornee.ts`, nourri par `useMe` via `poserVueBornee`) : `api()` ne lance
pas une lecture GET couverte et lève le même refus — préfixe de chaîne, slash final compris
(`/api/connectors/` refusé laisse `/api/connectors` exact ouvert). Le front n'ajoute que ce que
le serveur ne peut pas savoir : quel ÉCRAN vit de quelle lecture (`SECTIONS_HORS_VUE` :
facturation, abonnement Claude, développeurs, plateforme), masqué du menu (`navItemVisible`) et
renvoyé sur l'aperçu (garde du routeur) quand sa lecture est refusée ; et la sécurité du compte,
toujours masquée en vue bornée (la MFA y est lue sur Logto pour le compte connecté, jamais pour
le membre vu). Avant la lecture de `/api/me`, rien n'est masqué ni retenu : le serveur reste
l'autorité. Un écran qui lit en partie une liste refusée se masque sur `estHorsVue` (pile de
clés d'un connecteur, routines) ; la liste des partages reçus rend vide (`horsVueVide`) — en vue
bornée, un partage personnel reçu ne compte pas, côté serveur non plus. Tests : `lib/vueBornee.spec.ts`,
`views/console/voirEnTantQueOrg.spec.ts`.

## Hub compte (`/account`)

`AccountView.vue` = hub « gérer mon compte » (≠ ancien écran profil seul) : carte **profile**
(avatar/nom/email, `uploadAvatar`/`deleteAvatar`), carte **compte & accès** (email + rôle
plateforme en lecture seule + `logout`), carte **agent readme · toi** (`AgentReadmeCard`,
niveau USER — `getInitGuide('user')`/`setInitGuide('user', …)`, injecté à chaque session
après plateforme/org/équipe), carte **cli & api tokens** (`AccountTokensCard.vue`, `getTokens`/`createToken`/
`deleteToken` — migrés depuis `ConnectorsView`, user-scopés). Pas de préférences/langue
(aucune infra i18n dans le repo).

### Mon abonnement Claude (`/account/claude`)

`AccountClaudeView.vue`, logique dans `lib/modelSubscription.ts` (`useModelSubscription`), API
`/api/me/model-subscriptions` (palier **membre** seul : ni l'org ni un admin ne le lit ni ne le
coupe). Brancher son abonnement Claude (Pro, Max) pour que ses agents tournent dessus — modèles
`sub:sonnet|opus|haiku` du catalogue runner, famille `claude_subscription`.

- **État** : non connecté (aucune ligne) · connecté (+ palier, ex. `max`) · à reconnecter ·
  en pause jusqu'à `limit_reset_at` · déconnecté ; `waiting_jobs > 0` se dit (« N travaux
  attendent »). `statut` est servi en `str` : `statutOf` le resserre et **lève** sur une valeur
  inconnue.
- **Connexion, une action à la fois** : « Connecter » → `POST …/login` → l'URL s'ouvre dans un
  onglet (`noopener`, lien de secours : l'ouverture suit un aller-retour réseau et peut être
  bloquée) → champ du code affiché par Anthropic → `PUT …/login/code`, dont la réponse EST le
  nouvel état. « Recommencer » ramène au bouton. Un code refusé (`login_failed`) laisse l'étape
  ouverte.
- **Option nominative** : aucune lecture ne dit qui l'a ; le 403 `subscription_not_enabled` au
  premier geste passe l'écran en « option non ouverte » et retire le bouton.
- **Retrait** : « Se déconnecter » (garde le sandbox, statut `disconnected`) ; « Effacer mon sandbox »
  (`?destroy=true`, irréversible) après confirmation `usePrompt` — jamais `window.confirm`.
  Après un retrait l'état est **relu**, pas déduit.
- Le sélecteur de modèle d'une programmation (`optionsModele`) propose les `sub:*` dès que le
  catalogue les sert (`served`) : aucun filtre dédié.
