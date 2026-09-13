---
title: Orgs, groupes & invitations
type: reference
description: >-
  Qui est admin d'org pour l'écran, et la garde serveur de chaque usage (oto#210). Le roster
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

`useOrgScope` (`/org`, `/org/settings`, `/org/security`, `/org/monitoring`) portait déjà la règle
juste, plus le rôle lu dans le détail de l'org : inchangé. Restent sur `org_role === 'org_admin'`
seul : l'écriture du contexte d'org (`ContextOrgView`), la note de portée de la rédaction
(`useUserAdapter`) et le bandeau côté org de la fiche connecteur. Ils n'offrent rien à l'admin
plateforme ; ils taisent un geste au super_admin — le défaut inverse, hors de ce lot.

⚠️ **Non traité** : en consultation (`active_org_readonly`), le serveur refuse TOUTE écriture
(`403 view_as_read_only`), super_admin compris. `isOrgAdmin` est un rôle, pas un droit d'écrire :
seuls les gestes de campagne composent la lecture seule ; les écrans `/org/*` montrent encore
leurs gestes au super_admin qui consulte une org.

Tests : `composables/useMe.spec.ts` (règle, menu, gestes de campagne), `views/console/GroupsView.spec.ts`,
`components/console/connector-scope/useOrgAdapter.spec.ts`.

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
