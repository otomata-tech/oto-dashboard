---
title: Orgs, groupes & invitations
type: reference
description: >-
  Qui est admin d'org pour l'écran, et la garde serveur de chaque usage (oto#210). Écrire dans
  l'org : le rôle ET hors consultation, une seule règle pour tous les gestes (oto#211), `/connectors`
  compris ; « voir en tant que » n'est pas servi, donc pas couvert (oto#212). Le roster
  des équipes d'une org (le scope d'équipe dédié a quitté le dashboard, oto#192) et
  la feature cascade « inviter un user » : une carte partagée montée aux 2 niveaux (plateforme
  / org), même triade REST, acceptation commune.
---

# Orgs, groupes/départements et invitations

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Qui est admin d'org pour l'écran (oto#210)

`isOrgAdmin` (`composables/useMe.ts`) = l'admin d'org **tel que le serveur le tient**
(`roles.is_org_admin`) : l'org_admin de l'org active, ou le super_admin. Jusqu'au 13/09/2026 il
comptait aussi l'`admin` plateforme, que chaque op d'admin d'org refuse en 403 : des gestes lui
étaient montrés, qui échouaient. Gardes relues sur oto-backend `origin/main` (`f4124f22`) :

| usage | ce qu'il conditionne | garde serveur | admin plateforme |
|---|---|---|---|
| menu d'org (`orgAdmin`) : membres, paramètres, sécurité, connecteurs, équipes ; « Gérer mon org » | voir l'écran | lectures `ORG_MEMBER_OF` — en consultation, `effective_org_role` le tient pour membre | les lit : **non restreint** (`seesOrgAdministration`) |
| menu d'org : supervision (`orgAdminReads`) | voir l'écran | lectures `ORG_ADMIN_OF`, même en consultation | refusé : entrée retirée |
| `/org/connectors` (`useOrgAdapter`) : disponibilité, clé d'org, autoriser au scope org | gestes | `ORG_ADMIN_OF` ; `is_org_admin` dans le corps pour l'autorisation qui lit le scope | refusé : gestes retirés |
| `/org/teams` (`GroupsView`) : créer, renommer, supprimer | gestes | `ORG_ADMIN_OF` ; `GROUP_ADMIN_OF` | refusé : gestes retirés |
| `/org/teams/:id` (`TeamDetailView`) : membres (add/role/remove) | gestes | `GROUP_ADMIN_OF` (lecture : `GROUP_MEMBER_OF`) | refusé : gestes retirés (lecture ouverte) |
| campagnes (`runnerGestes.droits`) : armer, relancer | gestes | `is_org_admin` dans le corps → `403 org_admin_required` | déjà refusé (oto#205), s'appuie sur `isOrgAdmin` |
| abonnement (`BillingView`), clé d'org depuis une fiche connecteur (`useUserAdapter`, `ConnectorConnectionPanel`) | gestes | non relue dans ce lot | règle déjà juste, recopiée : s'appuie sur `isOrgAdmin` |

Depuis oto#211, les gestes de ce tableau lisent `canAdministerOrg`, qui ajoute au rôle l'absence
de consultation (section suivante) ; la clé d'org depuis une fiche connecteur l'a rejoint avec
oto#212.

`useOrgScope` (`/org`, `/org/settings`, `/org/security`, `/org/monitoring`) portait déjà la règle
juste, plus le rôle lu dans le détail de l'org. Son `isOrgAdmin` ne garde plus que des lectures (la
supervision) ; ses gestes passent par `canWrite` et `canAdminister` (oto#211). Restent sur `org_role === 'org_admin'`
seul : l'écriture du contexte d'org (`ContextOrgView`), la note de portée de la rédaction
(`useUserAdapter`) et le bandeau côté org de la fiche connecteur. Ils n'offrent rien à l'admin
plateforme ; ils taisent un geste au super_admin — le défaut inverse, hors de ce lot.

Tests : `composables/useMe.spec.ts` (règle, menu, gestes de campagne), `views/console/GroupsView.spec.ts`,
`components/console/connector-scope/useOrgAdapter.spec.ts`.

## Écrire dans l'org : le rôle ET hors consultation (oto#211)

En consultation (`active_org_readonly` : un opérateur plateforme ouvre une org où il n'a aucun rôle
réel), `ViewAsMiddleware` refuse toute requête non-GET dont l'`op` n'est pas une lecture
(`_READ_OPS`, liste blanche), en `403 view_as_read_only` — super_admin compris. Jusqu'au 13/09/2026,
seuls les gestes de campagne en tenaient compte : les écrans `/org/*` offraient au super_admin qui
consulte l'org d'un client des gestes dont chaque clic échouait.

La règle vit à un seul endroit, `composables/useMe.ts` :
- `canWriteInOrg` — un geste ouvert à tout membre : un profil chargé, hors consultation
  (`active_org_readonly`) et hors « voir en tant que » en lecture (`view_as_read_only`, oto#212) ;
- `canAdministerOrg` — un geste d'admin d'org : `canWriteInOrg` ET `isOrgAdmin`.

`useOrgScope` les expose (`canWrite`, `canAdminister`) ; `runnerGestes.droits` en est la projection
(`ouverts`, `armer`), à comportement strictement égal. Aucun écran ne relit `active_org_readonly`.
La lecture seule se dit **une fois**, dans la coque : `ConsultOrgBanner` (monté dans `App.vue`).
L'écran omet ses gestes, jamais grisés, et ne la répète pas ; ses lectures restent.

| écran | geste | appel | règle |
|---|---|---|---|
| `/org` | promote/demote, remove | `POST`/`DELETE /api/orgs/{id}/members/{sub}` | `canAdminister` |
| `/org` | voir en tant que (lecture seule, bornée à l'org, oto#270) | en-têtes `X-Oto-View-As` + `X-Oto-Org` (aucune écriture) | `canAdminister` ET `org_role === 'org_admin'` (le rôle réel, pas l'escalade super_admin) ; jamais sur soi |
| `/org` | invite, revoke (`InvitationsCard`) | `POST /api/orgs/{id}/invitations`, `DELETE …/invitations/{iid}` | `canManage` = `canAdminister` ; la liste reste lue (`canRead` = `isOrgAdmin`) |
| `/org/settings` | modifier, déposer ou retirer le logo, supprimer | `PATCH /api/orgs/{id}`, `POST`/`DELETE …/logo`, `DELETE /api/orgs/{id}` | `canAdminister` |
| `/org/settings` | quitter | `DELETE /api/me/orgs/{id}/membership` | `canWrite` ; sans geste, la « zone danger » disparaît |
| `/org/security` | activer ou désactiver le MFA | `PUT /api/orgs/{id}/mfa` | `canAdminister` |
| `/org/security` | exporter le journal des accès (lecture, CSV ou JSON) | `GET /api/orgs/{id}/audit-log/export` | `isOrgAdmin` (une lecture, `ORG_ADMIN_OF`) |
| `/org/connectors` | disponibilité, clé d'org, autoriser | `PUT`/`DELETE …/connectors/{p}/activation`, `PUT`/`DELETE …/secrets/{p}`, `POST /api/me/connectors/{p}/connect` | `canAdministerOrg` (`useOrgAdapter`) |
| `/org/connectors` | tester | `POST /api/me/connectors/{p}/verify`, sans `op` | `canWriteInOrg` (`canVerify` du levier) |
| `/org/connectors` | annuler un envoi programmé | `DELETE /api/orgs/{id}/scheduled-emails/{eid}` (`ORG_MEMBER_OF`) | `canWriteInOrg` |
| `/org/teams` | new, edit, delete | `POST /api/orgs/{id}/groups`, `PATCH`/`DELETE /api/groups/{id}` | `canAdministerOrg` |
| `/org/teams/:id` | add member, role, remove | `POST /api/groups/{id}/members{,/{sub}}`, `DELETE /api/groups/{id}/members/{sub}` | `canAdministerOrg` OU chef explicite de CETTE équipe (`my_role`) |
| `/org/billing` | choisir, payer, changer de carte, résilier, annuler la résiliation, identité | `POST /api/me/billing/{subscribe,method,cancel,resume}`, `PUT /api/me/billing/identity` | `canAdministerOrg` (`canManage`) |
| `/automations` | armer, relancer, arrêter, régler un déclencheur | `docs/automations.md` | `droits` |
| `/org/settings` | régler le plafond de consommation des abonnements Claude, revenir au défaut ; changer le mode (personnel / pool) | `PUT /api/orgs/{id}/model-subscriptions/{family}`, `PUT …/{family}/mode` | `canAdminister` ; la lecture (`GET`, membre) reste |

**Mesuré, pas seulement lu** : les 27 appels des dix premières lignes ont été rejoués le 13/09/2026
contre le `ViewAsMiddleware` d'oto-backend `origin/main` (`f4124f22`), avec la méthode, le chemin et
le corps que le front envoie. En consultation, tous prennent `403 view_as_read_only` ; pour un membre
réel, tous traversent ; les lectures (`GET`) passent.

Hors du tableau, sans changement :
- `/org/context` (`ContextOrgView`) lit `org_role === 'org_admin'`, que le serveur sert `null` en
  consultation : ses gestes y sont déjà absents. Le défaut inverse (super_admin) reste hors lot.
- `/org/monitoring` n'écrit rien ; ses lectures (`ORG_ADMIN_OF`) restent gardées par `isOrgAdmin`.
  L'export du journal des accès (onglet « journal », `OrgAuditExportCard`, oto#269) en est une :
  `GET /api/orgs/{id}/audit-log/export`, servi aussi en consultation. Le fichier est la réponse
  servie (JSON : `total`, `truncated`, `until_effectif`, émetteur déclaré), une page par fichier ;
  tronqué, la suite part avec le seul `next_cursor`. Tests : `OrgAuditExportCard.spec.ts`.
- `ConsoleIdentity` n'affiche que l'identité.

⚠️ **Deux cas où l'écran et le serveur divergent, non traités** :
- **consultation par l'équipe** (`/o/<org>/g/<équipe>/…`, en-tête `X-Oto-Group`) : `/api/me` sert
  `active_org_readonly`, l'écran masque donc ses gestes ; mais le middleware ne pose la lecture
  seule que sur la branche org, et une écriture y traverse (mesuré le 13/09, `roles.can_read_group`
  acceptant). À trancher côté serveur.
- **« voir en tant que »** (`X-Oto-View-As`) : le middleware refuse toute écriture (rejoué le
  13/09 pour oto#212 : les 22 écritures de `/connectors` prennent `403 view_as_read_only`), mais
  **aucun champ servi ne le dit**. `/api/me` est calculé pour le compte vu : le sub servi est la
  cible, la consultation ne pose aucune org, et `active_org_readonly` (le seul champ de lecture
  seule de `MeView`) vaut donc faux pour un membre. Le front ne le déduit pas, ni de l'en-tête
  qu'il envoie, ni du `localStorage` du bandeau : c'est un besoin de contrat backend. D'ici là, les
  gestes du compte vu restent affichés.

Tests : `views/console/orgConsultation.spec.ts` (`/org`, `/org/settings`, `/org/security`, pied de
`/org/connectors`), `views/console/GroupsView.spec.ts`, `views/console/BillingView.spec.ts`,
`components/console/connector-scope/useOrgAdapter.spec.ts` et `ConnectorCredentialPanel.spec.ts`,
`composables/useMe.spec.ts` (la règle, et `droits` égal à sa projection) — chaque écran, pour
l'org_admin et le super_admin, gestes présents hors consultation et absents en consultation.

## `/connectors` en consultation (oto#212)

`/o/<org>/connectors` est un écran de travail, hors `/org/*` : un opérateur non-membre y lit ses
propres connecteurs dans le contexte de l'org consultée, et le serveur y refuse chaque écriture
comme ailleurs. Jusqu'au 13/09/2026, l'écran les offrait toutes. Même règle, mêmes fonctions : chaque
composant qui porte un geste lit `canWriteInOrg` (ou `canAdministerOrg` pour la clé d'org), et
l'état reste lu.

| composant | geste | appel | règle |
|---|---|---|---|
| exposition (`ConnectorAvailabilityPanel`, levier de `useUserAdapter`) | actif, en veille, non installé | `POST /api/me/connectors/{p}/select`, `POST …/pause`, `DELETE /api/me/connectors/{p}` | `canWriteInOrg` (`canEdit`) ; sans droit, l'état se lit sur une ligne, les boutons ne sont plus grisés |
| connexion (`ConnectorConnectionPanel`) | connecter, poser ma clé | `POST /api/settings/api-keys/{p}` | `canWriteInOrg` |
| connexion | poser la clé de l'org | `PUT /api/orgs/{id}/secrets/{p}` | `canAdministerOrg` (panneau et `useUserAdapter.configureKey`) |
| flux déclaré (`ConnectorFlowConnect`) | autoriser, identifiants de l'application | `POST /api/me/connectors/{p}/connect`, `POST /api/settings/api-keys/{p}` | `canWriteInOrg` : l'encart est omis, l'étape restante reste dite par le verdict |
| pile de provenance (`ConnectorKeyStack`) | tester, remplacer, retirer, suspendre, réactiver | `POST …/{p}/verify`, `POST`/`DELETE /api/settings/api-keys/{p}`, `POST /api/me/connector-instances/suspend` | `canWriteInOrg` |
| comptes nommés (`ConnectorKeyAccounts`) | par défaut, retirer, ajouter | `PUT /api/connectors/{p}/identities/default`, `DELETE …/api-keys/{p}?account=`, `POST …/api-keys/{p}` | `canWriteInOrg` |
| Google (`ConnectorOAuthAccounts`) | link account, revoke | `POST /api/me/connectors/google/connect`, `DELETE /api/google/oauth?account=` | `canWriteInOrg` |
| MCP fédéré (`ConnectorFederatedWidget`) | connect, reconnect, disconnect | `POST …/{p}/connect`, `DELETE /api/me/connectors/{p}/oauth` | `canWriteInOrg` |
| session navigateur (`ConnectorSessionWidget`) | connecter, déconnecter, choisir la cible, utiliser | `POST …/{p}/session/{start,finalize}`, `DELETE …/api-keys/{p}?scope=`, `PUT …/identities/default` | `canWriteInOrg` |
| compte hébergé (`ConnectorHostedWidget`, `AccountShareSection`) | poser, changer ou retirer ma clé, connecter, déconnecter, utiliser ce compte, autoriser quelqu'un, révoquer | `POST`/`DELETE /api/settings/api-keys/unipile`, `POST /api/me/unipile/connect`, `DELETE /api/me/unipile?channel=`, `PUT …/identities/default`, `POST`/`DELETE /api/me/connector-accounts/{c}/grants` | `canWriteInOrg` ; la section de partage disparaît quand il n'y a ni geste ni autorisation |
| marketplace (`ConnectorLibraryView`, `ConnectorDetail`) | install, installer | `POST /api/me/connectors/{p}/select` | `canWriteInOrg` |

**Mesuré** : ces 22 écritures ont été rejouées le 13/09/2026 contre le `ViewAsMiddleware` d'oto-backend
`origin/main` (`f4124f22`), avec la méthode, le chemin et le corps du front, dans trois modes : en
consultation d'org et en « voir en tant que », toutes prennent `403 view_as_read_only` ; pour un membre
réel, toutes traversent ; six lectures (`GET`) passent dans les trois modes. Sans geste d'écriture :
les outils et la confidentialité (en lecture depuis oto#192), la fiche d'un outil (`GET`).

Tests : `components/console/connector-scope/connectorsConsultation.spec.ts` (treize cas, chacun pour
l'org_admin et le super_admin hors et en consultation, et pour l'admin plateforme en consultation),
`useUserAdapter.spec.ts` (la clé d'org en consultation).

## Abonnements Claude : mode et plafond de consommation (`/org/settings`, 25/09/2026)

Carte `OrgModelSubscriptionCard` (logique `useOrgModelSubscription` / `useLimitDraft` dans
`lib/modelSubscription.ts`), sous les namespaces débloqués. Quand un run de l'org tourne sur
l'abonnement Claude d'un membre (famille `claude_subscription`, modèles `sub:*`), le plafond est la
part maximale de l'usage **total** du compte Claude de ce membre (fenêtres 5 h et 7 j) que le run
peut atteindre. Au seuil, le run en cours finit et les suivants attendent la réinitialisation.

- **Lecture, tout membre** : `GET /api/orgs/{id}/model-subscriptions/{family}` → `limit_pct` et
  `default` (vrai = rien de réglé, défaut plateforme 80 %) ; tag « 80 % · défaut » ou « 60 % », date
  de modification. Un membre lit que seul un admin peut changer le plafond.
- **Édition, admin d'org** (`canAdminister`, donc omise en consultation) : champ 1–100 (entier) et
  « Enregistrer » → `PUT` `{limit_pct}` ; hors bornes, le bouton reste inerte (`parseLimitInput`,
  miroir de `exiger_limite_valide`). « Revenir au défaut (80 %) » → `PUT {limit_pct: null}`, affiché
  seulement quand l'org a réglé quelque chose. La réponse du `PUT` est l'état relu.
- ⚠️ `PLATFORM_DEFAULT_LIMIT` (80) est un **miroir** de `_abonnement.DEFAUT_LIMITE_PCT` : il ne sert
  qu'à nommer le défaut sur le bouton et dans la phrase de l'écran perso ; la valeur en vigueur est
  toujours lue.
- Le plafond **perso** d'un membre (écran `/account/claude`, `docs/identite-et-consultation.md`)
  ne peut que resserrer celui de l'org : le plus bas des deux s'applique.


**Le mode** (en tête de la carte, `modeOf` resserre le `mode` servi en `str` et lève sur l'inconnu) :
qui paie les travaux de l'org sur la famille `claude_subscription`.

- `personnel` (défaut) : chaque travail tourne sur l'abonnement de son demandeur ; les flottes n'y
  tournent pas.
- `pool` : les travaux, flottes comprises, tournent sur l'abonnement d'un membre qui l'a **prêté** à
  l'org (opt-in par org, sur `/account/claude`, `docs/identite-et-consultation.md`), le moins
  récemment servi d'abord ; sans prêteur libre, ils attendent. Le forfait consommé est celui du
  prêteur, sous son plafond (le plus strict entre celui de l'org et le sien). La carte dit le nombre
  de prêteurs (`pool_size`, prêts d'abonnements connectés) ; **zéro** = alerte « les travaux de
  l'org attendent », avec le lien vers « Mon abonnement Claude » dans la phrase (le levier).
- **Lecture** : tag du mode, phrase de ce qu'il change, et pour un membre « seul un admin de l'org
  peut changer de mode ». **Édition** (admin d'org, `canAdminister`) : choix segmenté personnel /
  pool en brouillon ; passer en pool affiche **avant** l'envoi un avertissement sobre (le travail
  d'une personne tournera sur l'abonnement d'une autre) — pas de modale : « Enregistrer » /
  « Annuler » sont dessous. → `PUT …/{family}/mode {mode}` ; la réponse relue (`pool_size`
  compris) fait foi. Le mode a son propre état d'envoi (`modeBusy`/`modeError`) : un refus s'affiche
  sous le choix du mode, pas sous le plafond. Effet sur les travaux suivants, un travail en cours
  n'est jamais coupé.

Tests : `components/console/OrgModelSubscriptionCard.spec.ts`.

## Groupes / départements (ADR 0012)

Liste des équipes d'une org : `/org/teams` (`GroupsView.vue`) — lister, créer, renommer, supprimer (org_admin), et depuis chaque ligne, gérer ses membres (`/org/teams/:id`, `TeamDetailView.vue` — cf. plus haut). Les anciens chemins `/console/groups` et `/org/departments` sont des redirections (`router/index.ts`) ; `/org/teams/:id` ne l'est plus depuis le 18/09/2026. Un membre bascule son **groupe actif** (`useGroup` → `PUT /api/me/active-group`) ; une équipe se **consulte** par le préfixe d'URL `/o/:org/g/:group/` sur les écrans de travail (`WorkspaceSwitcher`). Hiérarchie de droits côté backend (`roles.py`, escalade descendante) — l'UI masque seulement les contrôles.

> **Le scope d'équipe dédié a quitté le dashboard (oto#192, 12/09/2026).** Ses pages — `/team`
> (membres, secrets partagés et invitation d'équipe, `TeamMembersView` + `GroupDetailCards`),
> `/team/context` (readme d'équipe), `/team/connectors` (disponibilité, clé et accès d'équipe,
> `useTeamAdapter`) et `/team/procedures` (`GroupDoctrineCard`) — comptaient un utilisateur et
> un jour d'usage en 45 jours. Partis avec elles : l'entrée « Gérer mon équipe » et le fil
> d'Ariane Plateforme ▸ Org ▸ Team de `ConsoleIdentity`, `useTeamScope`, `TeamScopeHeader`,
> et les appels `/api/groups/{id}/{members,secrets,connectors,instructions,invitations}`.
> Les routes backend restent servies (dashboard.oto.cx les appelle) ; leur retrait se décide
> route par route, après le tag prod du front. Un ancien lien `/team/*` ou `/group` retombe
> sur l'accueil (route attrape-tout).
>
> **Retour partiel (18/09/2026)** : un besoin réel (poser/remplacer la clé partagée d'une
> équipe, coupure de connecteur, accès réservé à des membres) a montré que la mesure du
> 12/09 ratait au moins ce cas. Restaurés, périmètre resserré à ce SEUL panneau :
> `useTeamAdapter`, `useTeamScope`, `TeamScopeHeader`, `TeamConnectorsView`, les fonctions
> `api/console.ts` de connecteur/secret d'équipe (`setGroupSecret`, `getGroupConnectorActivation`,
> etc.), le type `GroupConnectorActivation` (l'accès réservé à des membres, `getGroupConnectorAcl`
> et `GroupAclEntry`, a disparu le 24/09/2026 avec la restriction « vers le bas », ADR 0053 D1). Route
> de détail minimale et NOUVELLE (pas l'ancienne `/team/connectors`) :
> `/org/teams/:groupId/connectors`, atteinte par un bouton « Connectors » sur `GroupsView`
> (visible org_admin ou chef de CETTE équipe). Niveau nav `'team'` réintroduit
> (`consoleNav.ts`, `registry.ts`) mais SANS le fil d'Ariane ni l'entrée « Gérer mon équipe »
> de `ConsoleIdentity` — navigation par un simple lien dur (`window.location.assign`), pas
> une refonte du switcher. Ce qui reste retiré : membres, contexte, procédures, invitation
> d'équipe — à rouvrir séparément si le même signal se confirme pour eux.
>
> **Le soir même (18/09), l'entrée « Gérer mon équipe » revient.** Un chef d'équipe qui
> n'est pas admin d'org n'avait AUCUNE porte vers ce qu'il a le droit de gérer : la liste
> des équipes vit sous « gérer mon org », qu'il ne voit pas (`orgAdmin` sur l'entrée), et
> aucune garde de route ne le bloque — seul le menu le masquait (vécu avec une cheffe
> d'équipe qui devait remplacer la clé Pennylane de son équipe). Ce qui existe désormais :
> - `ConsoleIdentity` offre « Gérer mon équipe » à qui est `group_admin` de son équipe
>   ACTIVE (`me.group_role`, le rôle que le serveur tient sur l'équipe affichée) →
>   `/org/teams/<active_group>` ; un chef de plusieurs équipes change d'équipe active pour
>   gérer l'autre ; sans équipe active, pas d'entrée ;
> - un groupe de nav de niveau `'team'` (`nav.section.team` : membres, connecteurs), dont
>   les chemins portent le jeton `{groupId}` (`TEAM_TOKEN`, résolu par la sidebar depuis la
>   route, sinon l'équipe active) et nomment leur page de détail (`NavItem.detail`, qui
>   dit « on est ici » à la place de la section, partagée par les deux pages) ;
> - la page membres `/org/teams/:teamId` passe au niveau `'team'` (elle était `'org'`) :
>   les deux pages d'une équipe ont la même sidebar ; l'admin d'org revient à la liste par
>   « Gérer mon org » du menu profil ;
> - `DETAIL_META` titre les deux pages (« membres de l'équipe », « connecteurs de l'équipe »).
> Toujours pas de fil d'Ariane Plateforme ▸ Org ▸ Team ni de switcher d'équipe : le lot
> ouvre la porte, il ne rebâtit pas le scope.

**Les MEMBRES sont revenus, seuls (18/09/2026).** Un besoin réel (un membre d'équipe, pas
org_admin, bloqué pour gérer les membres/secrets de sa propre équipe) a montré que la mesure
d'oto#192 ratait ce cas. Périmètre resserré, décidé par Alexis : uniquement `POST`/`DELETE
/api/groups/{id}/members{,/{sub}}` — pas le contexte, pas les connecteurs, pas les procédures,
pas l'invitation d'équipe (ces gestes restent hors dashboard). Porté par `/org/teams/:teamId`
(`TeamDetailView.vue`, meta `detail: 'team'`, niveau `org`), atteint depuis une ligne de
`GroupsView.vue` (bouton « Members »). `TeamMembersCard.vue` reprend le composant `GroupDetailCards`
retiré par oto#192, sans sa carte `InvitationsCard` (invitation d'équipe, hors périmètre).
`canManage` = `canAdministerOrg` (le rôle explicite `my_role` sous-compte l'escalade org_admin,
cf. commentaire de `GroupBrief.my_role`) OU chef explicite de CETTE équipe.

> **Droits par verbe sur les procédures (oto-backend#695/#719, front #144) — historique.**
> Le serveur sert `can_write_instructions` et `can_delete_instructions` à côté de `can_edit`
> (qui dit le droit d'ADMINISTRER) : écrire ou restaurer une procédure est ouvert à tout
> membre de l'équipe propriétaire, supprimer reste au chef. Depuis oto#192 le dashboard
> n'écrit plus AUCUNE procédure, ni d'org ni d'équipe : `lib/instructionRights.ts`, qui
> câblait ces drapeaux et leur repli, est supprimé. La règle vaut toujours pour qui écrira
> de nouveau une procédure depuis un écran : un droit d'écriture ne se déduit pas d'un droit
> d'administration, et un `false` servi gagne sur tout repli.

`Me` porte `active_group`/`active_group_name`/`group_role` ; `ProviderStatus.mode` peut valoir `group` (libellé « team key »). Contrats : `oto-backend/docs/groups-and-roles.md`.

## Invitations — feature cascade (plateforme / org / équipe)

Inviter un user est une **feature cascade** (même geste aux trois niveaux). UNE carte partagée
`components/console/InvitationsCard.vue` (câblage API dans `composables/useInvitations.ts`)
montée sur les 3 écrans, gatée sur le rôle qui gère :
- **org** → `OrgView.vue` (`/org`, `scope={level:'org', id}`, gate `isOrgAdmin`) — l'invité rejoint l'org.
- **équipe** → `TeamDetailView.vue` (`/org/teams/:id`, `scope={level:'team', id}`, gate `canManage` = admin d'org ou chef de CETTE équipe, comme `GROUP_ADMIN_OF`) — l'invité rejoint l'org parente comme membre ET l'équipe avec le rôle choisi (`group_member` / `group_admin`). Revenue le 23/09/2026 : retirée le 12/09 avec le scope d'équipe (oto#192), elle existait dans oto-frontend, et le dashboard reste le front du produit.
- **plateforme** → `AdminUsersView.vue` (`/platform/users`, `scope={level:'platform'}`, gate admin plateforme) — onboarding pur (org perso au signup).

Chaque niveau expose la même triade REST (`api/console.ts`) : `list*Invitations` / `invite*` /
`revoke*Invitation` (org : `/api/orgs/{id}/invitations` ; équipe : `/api/groups/{id}/invitations` ;
plateforme : `/api/admin/invitations`). Plus de code court (retiré du backend le 15/09) : seul le
lien porte l'invitation.
**Acceptation commune** : `InviteAcceptView.vue` (routes `/invitation/:token`, `/invite?token=`)
→ `acceptInvite({token})`, avec copy adaptée au scope (`InvitePreview.scope`/`group_name`
→ « rejoindre l'équipe X / oto » — une invitation d'équipe émise ailleurs s'accepte toujours ici).
Backend : `oto-backend/docs/rest-api.md` §invitations + `capabilities/{orgs,groups,platform}_invites.py`.


## Export du journal des accès (oto#269, 24/09/2026)

`/org/security` porte l'export COMPLET du journal des accès de l'org (`OrgAuditComplianceCard.vue`,
`lib/auditExport.ts`) : la pièce qu'un admin d'org produit devant un auditeur ou un délégué à la
protection des données. Période optionnelle (du / au, vide = tout ce qui est conservé, 90 jours).
L'export **parcourt toutes les pages** servies (1 000 lignes au plus chacune) : la première fixe
la fenêtre, les suivantes ne passent que le curseur, qui la porte (le serveur refuse les deux
ensemble). Puis il **vérifie** que les lignes reçues valent le `total` annoncé et le dit :
« export complet », avec la fenêtre réellement appliquée (`until_effectif`), ou « incomplet, ne
le produis pas tel quel ». CSV (colonnes du journal, sans arguments ni secrets) ou JSON (la pièce
entière : fenêtre, total, complétude, lignes). Le nom du fichier dit la fenêtre. Ce que la pièce
ne couvre pas, et que la carte dit : les gestes faits dans le tableau de bord, et au-delà de la
rétention. Les deux exports gardés (décision d'Alexis, 24/09/2026) partagent l'appel
(`getOrgAuditLogExport`), les types (`AuditExport`, `AuditCall`) et la sortie de fichier
(`saveBlob`) : `/org/monitoring` sert la réponse brute page par page, `/org/security` la pièce
entière vérifiée.
