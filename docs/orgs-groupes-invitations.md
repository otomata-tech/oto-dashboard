---
title: Orgs, groupes & invitations
type: reference
description: >-
  L'écran des départements (chef d'équipe, secrets partagés, doctrine de groupe) et la featu
  re cascade « inviter un user » : une carte partagée montée aux 3 niveaux (plateforme / org
   / équipe), même triade REST, acceptation commune.
---

# Orgs, groupes/départements et invitations

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Groupes / départements (ADR 0012)

Section `/console/groups` (`GroupsView.vue` + `GroupDoctrineCard.vue`) : départements d'une org avec **chef d'équipe** (`group_admin`). Un membre bascule son **groupe actif** (`useGroup` → `PUT /api/me/active-group`) ; le chef (ou un org_admin) gère membres, **secrets partagés** (résolus avant ceux de l'org), **preset de toolset** (baseline de visibilité) et **doctrine** de groupe. Hiérarchie de droits côté backend (`roles.py`, escalade descendante) — l'UI masque seulement les contrôles. `Me` porte `active_group`/`active_group_name`/`group_role` ; `ProviderStatus.mode` peut valoir `group` (libellé « team key »). Contrats : `oto-backend/docs/groups-and-roles.md`.

## Invitations — feature cascade (plateforme / org / équipe)

Inviter un user est une **feature cascade** (même geste aux 3 niveaux, comme la gouvernance
connecteurs). UNE carte partagée `components/console/InvitationsCard.vue` (câblage API dans
`composables/useInvitations.ts`) montée sur les 3 écrans, gatée sur le rôle qui gère :
- **org** → `OrgView.vue` (`/org`, `scope={level:'org', id}`, gate `isOrgAdmin`) — l'invité rejoint l'org.
- **équipe** → `GroupDetailCards.vue` (`/team`, `scope={level:'team', id}`, gate `canManage`) — l'invité rejoint l'org PUIS l'équipe. (À côté du geste « ajouter un membre déjà dans l'org ».)
- **plateforme** → `AdminUsersView.vue` (`/platform/users`, `scope={level:'platform'}`, gate admin plateforme) — onboarding pur (org perso au signup).

Chaque niveau expose la même triade REST (`api/console.ts`) : `list*Invitations` / `invite*` /
`revoke*Invitation` (org : `/api/orgs/{id}/invitations` ; équipe : `/api/groups/{id}/invitations` ;
plateforme : `/api/admin/invitations`). **Acceptation commune** inchangée : `InviteAcceptView.vue`
(routes `/invite`, `/invitation/:code`) → `acceptInvite({token?|code?})`, avec copy adaptée au
scope (`InvitePreview.scope`/`group_name` → « rejoindre l'équipe X / oto »). Backend :
`oto-backend/docs/rest-api.md` §invitations + `capabilities/{orgs,groups,platform}_invites.py`.
