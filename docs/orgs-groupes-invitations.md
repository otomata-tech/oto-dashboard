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

Section `/console/groups` (`GroupsView.vue` + `GroupDoctrineCard.vue`) : départements d'une org avec **chef d'équipe** (`group_admin`). Un membre bascule son **groupe actif** (`useGroup` → `PUT /api/me/active-group`) ; le chef (ou un org_admin) gère membres, **secrets partagés** (résolus avant ceux de l'org), **preset de toolset** (baseline de visibilité) et le **readme** de groupe. Hiérarchie de droits côté backend (`roles.py`, escalade descendante) — l'UI masque seulement les contrôles.

> **Une procédure d'équipe ne suit PAS cette règle** (oto-backend#695/#719, front #144).
> **Écrire** une procédure — et **restaurer** une version, qui n'en est que le défaire —
> est ouvert à **tout membre** de l'équipe, pour qu'une opératrice puisse annoter le
> déroulé qu'elle exécute sans qu'on ait à la faire cheffe (un rôle qui emporte les clés
> partagées). **Supprimer** reste au chef : ça emporte l'historique et c'est irréversible.
> Le bundle sert donc **deux droits par verbe** — `can_write_instructions` et
> `can_delete_instructions` — sous les **mêmes noms** sur les deux surfaces
> (`GET /api/groups/{id}/instructions` et `GET /api/me/instructions`), pour qu'un composant
> factorisé n'ait pas à savoir sur quelle page il est.
>
> **`can_edit` n'a pas changé de sens** : il dit toujours le droit d'ADMINISTRER, et un
> intégrateur tiers le lit ainsi. Ici il ne gouverne plus que le readme, la publication en
> bibliothèque et le partage — plus aucun geste d'écriture de procédure. Le câblage passe
> par `lib/instructionRights.ts`, qui porte aussi le **repli** : champs absents = serveur
> plus ancien, car une absence n'est pas un « non ». L'écran d'équipe lui donne alors le
> rôle du requérant (`useTeamScope`, dérivé de `my_role`) plutôt que `can_edit`, qui
> refermerait l'écriture à une membre ; l'écran d'org, qui n'a pas cette information,
> retombe sur `can_edit`. Un `false` **servi** reste un refus et gagne sur tout repli.

`Me` porte `active_group`/`active_group_name`/`group_role` ; `ProviderStatus.mode` peut valoir `group` (libellé « team key »). Contrats : `oto-backend/docs/groups-and-roles.md`.

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
