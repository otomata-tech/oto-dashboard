---
title: Orgs, groupes & invitations
type: reference
description: >-
  Qui est admin d'org pour l'écran, et la garde serveur de chaque usage (oto#210). Écrire dans
  l'org : le rôle ET hors consultation, une seule règle pour tous les gestes (oto#211). Le roster
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
| `/org/connectors` (`useOrgAdapter`) : disponibilité, clé d'org, accès réservé, autoriser au scope org | gestes | `ORG_ADMIN_OF` ; `is_org_admin` dans le corps pour l'autorisation qui lit le scope | refusé : gestes retirés |
| `/org/teams` (`GroupsView`) : créer, renommer, supprimer | gestes | `ORG_ADMIN_OF` ; `GROUP_ADMIN_OF` | refusé : gestes retirés |
| campagnes (`runnerGestes.droits`) : armer, relancer | gestes | `is_org_admin` dans le corps → `403 org_admin_required` | déjà refusé (oto#205), s'appuie sur `isOrgAdmin` |
| abonnement (`BillingView`), clé d'org depuis une fiche connecteur (`useUserAdapter`, `ConnectorConnectionPanel`) | gestes | non relue dans ce lot | règle déjà juste, recopiée : s'appuie sur `isOrgAdmin` |

Depuis oto#211, les gestes de ce tableau lisent `canAdministerOrg`, qui ajoute au rôle l'absence
de consultation (section suivante).

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
- `canWriteInOrg` — un geste ouvert à tout membre : un profil chargé, hors consultation ;
- `canAdministerOrg` — un geste d'admin d'org : `canWriteInOrg` ET `isOrgAdmin`.

`useOrgScope` les expose (`canWrite`, `canAdminister`) ; `runnerGestes.droits` en est la projection
(`ouverts`, `armer`), à comportement strictement égal. Aucun écran ne relit `active_org_readonly`.
La lecture seule se dit **une fois**, dans la coque : `ConsultOrgBanner` (monté dans `App.vue`).
L'écran omet ses gestes, jamais grisés, et ne la répète pas ; ses lectures restent.

| écran | geste | appel | règle |
|---|---|---|---|
| `/org` | promote/demote, remove | `POST`/`DELETE /api/orgs/{id}/members/{sub}` | `canAdminister` |
| `/org` | invite, revoke (`InvitationsCard`) | `POST /api/orgs/{id}/invitations`, `DELETE …/invitations/{iid}` | `canManage` = `canAdminister` ; la liste reste lue (`canRead` = `isOrgAdmin`) |
| `/org/settings` | modifier, déposer ou retirer le logo, supprimer | `PATCH /api/orgs/{id}`, `POST`/`DELETE …/logo`, `DELETE /api/orgs/{id}` | `canAdminister` |
| `/org/settings` | quitter | `DELETE /api/me/orgs/{id}/membership` | `canWrite` ; sans geste, la « zone danger » disparaît |
| `/org/security` | activer ou désactiver le MFA | `PUT /api/orgs/{id}/mfa` | `canAdminister` |
| `/org/connectors` | disponibilité, clé d'org, autoriser, accès réservé | `PUT`/`DELETE …/connectors/{p}/activation`, `PUT`/`DELETE …/secrets/{p}`, `POST /api/me/connectors/{p}/connect`, `POST`/`DELETE …/connectors/{p}/access` | `canAdministerOrg` (`useOrgAdapter`) |
| `/org/connectors` | tester | `POST /api/me/connectors/{p}/verify`, sans `op` | `canWriteInOrg` (`canVerify` du levier) |
| `/org/connectors` | annuler un envoi programmé | `DELETE /api/orgs/{id}/scheduled-emails/{eid}` (`ORG_MEMBER_OF`) | `canWriteInOrg` |
| `/org/teams` | new, edit, delete | `POST /api/orgs/{id}/groups`, `PATCH`/`DELETE /api/groups/{id}` | `canAdministerOrg` |
| `/org/billing` | choisir, payer, changer de carte, résilier, annuler la résiliation, identité | `POST /api/me/billing/{subscribe,method,cancel,resume}`, `PUT /api/me/billing/identity` | `canAdministerOrg` (`canManage`) |
| `/automations` | armer, relancer, arrêter, régler un déclencheur | `docs/automations.md` | `droits` |

**Mesuré, pas seulement lu** : les 27 appels des dix premières lignes ont été rejoués le 13/09/2026
contre le `ViewAsMiddleware` d'oto-backend `origin/main` (`f4124f22`), avec la méthode, le chemin et
le corps que le front envoie. En consultation, tous prennent `403 view_as_read_only` ; pour un membre
réel, tous traversent ; les lectures (`GET`) passent.

Hors du tableau, sans changement :
- `/org/context` (`ContextOrgView`) lit `org_role === 'org_admin'`, que le serveur sert `null` en
  consultation : ses gestes y sont déjà absents. Le défaut inverse (super_admin) reste hors lot.
- `/org/monitoring` n'écrit rien ; ses lectures (`ORG_ADMIN_OF`) restent gardées par `isOrgAdmin`.
- `ConsoleIdentity` n'affiche que l'identité.

⚠️ **Deux cas où l'écran et le serveur divergent, non traités** :
- **consultation par l'équipe** (`/o/<org>/g/<équipe>/…`, en-tête `X-Oto-Group`) : `/api/me` sert
  `active_org_readonly`, l'écran masque donc ses gestes ; mais le middleware ne pose la lecture
  seule que sur la branche org, et une écriture y traverse (mesuré le 13/09, `roles.can_read_group`
  acceptant). À trancher côté serveur.
- **« voir en tant que »** (`X-Oto-View-As`) : le middleware refuse aussi toute écriture, mais
  `active_org_readonly` n'en dit rien ; les gestes du compte vu restent affichés (lu dans le code,
  non rejoué). Hors oto#211.

Tests : `views/console/orgConsultation.spec.ts` (`/org`, `/org/settings`, `/org/security`, pied de
`/org/connectors`), `views/console/GroupsView.spec.ts`, `views/console/BillingView.spec.ts`,
`components/console/connector-scope/useOrgAdapter.spec.ts` et `ConnectorCredentialPanel.spec.ts`,
`composables/useMe.spec.ts` (la règle, et `droits` égal à sa projection) — chaque écran, pour
l'org_admin et le super_admin, gestes présents hors consultation et absents en consultation.

## Groupes / départements (ADR 0012)

Liste des équipes d'une org : `/org/teams` (`GroupsView.vue`) — lister, créer, renommer, supprimer (org_admin). Les anciens chemins `/console/groups`, `/org/departments` et `/org/teams/:id` sont des redirections (`router/index.ts`). Un membre bascule son **groupe actif** (`useGroup` → `PUT /api/me/active-group`) ; une équipe se **consulte** par le préfixe d'URL `/o/:org/g/:group/` sur les écrans de travail (`WorkspaceSwitcher`). Hiérarchie de droits côté backend (`roles.py`, escalade descendante) — l'UI masque seulement les contrôles.

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

> **Droits par verbe sur les procédures (oto-backend#695/#719, front #144) — historique.**
> Le serveur sert `can_write_instructions` et `can_delete_instructions` à côté de `can_edit`
> (qui dit le droit d'ADMINISTRER) : écrire ou restaurer une procédure est ouvert à tout
> membre de l'équipe propriétaire, supprimer reste au chef. Depuis oto#192 le dashboard
> n'écrit plus AUCUNE procédure, ni d'org ni d'équipe : `lib/instructionRights.ts`, qui
> câblait ces drapeaux et leur repli, est supprimé. La règle vaut toujours pour qui écrira
> de nouveau une procédure depuis un écran : un droit d'écriture ne se déduit pas d'un droit
> d'administration, et un `false` servi gagne sur tout repli.

`Me` porte `active_group`/`active_group_name`/`group_role` ; `ProviderStatus.mode` peut valoir `group` (libellé « team key »). Contrats : `oto-backend/docs/groups-and-roles.md`.

## Invitations — feature cascade (plateforme / org)

Inviter un user est une **feature cascade** (même geste aux deux niveaux). UNE carte partagée
`components/console/InvitationsCard.vue` (câblage API dans `composables/useInvitations.ts`)
montée sur les 2 écrans, gatée sur le rôle qui gère :
- **org** → `OrgView.vue` (`/org`, `scope={level:'org', id}`, gate `isOrgAdmin`) — l'invité rejoint l'org.
- **plateforme** → `AdminUsersView.vue` (`/platform/users`, `scope={level:'platform'}`, gate admin plateforme) — onboarding pur (org perso au signup).

L'invitation d'**équipe** a quitté le dashboard avec le scope d'équipe (oto#192 : aucune en
45 jours) ; l'invitation d'org, elle, est vivante (89 acceptations depuis juin).

Chaque niveau expose la même triade REST (`api/console.ts`) : `list*Invitations` / `invite*` /
`revoke*Invitation` (org : `/api/orgs/{id}/invitations` ; plateforme : `/api/admin/invitations`).
**Acceptation commune** inchangée : `InviteAcceptView.vue` (routes `/invite`, `/invitation/:code`)
→ `acceptInvite({token?|code?})`, avec copy adaptée au scope (`InvitePreview.scope`/`group_name`
→ « rejoindre l'équipe X / oto » — une invitation d'équipe émise ailleurs s'accepte toujours ici).
Backend : `oto-backend/docs/rest-api.md` §invitations + `capabilities/{orgs,groups,platform}_invites.py`.
