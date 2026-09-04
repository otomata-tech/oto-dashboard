---
title: Écrans plateforme
type: reference
description: >-
  `/platform/objects` (object-browser des objets possédés, ADR 0030, plan gouvernance only),
  `/platform/tenants` (l'étage d'identité au-dessus des orgs, ADR 0052, lecture seule par
   construction, verdict « redémarrage requis ») et `/platform/outreach` (relance des comptes
   inactifs — cinq verrous, tous au serveur).
---

# Écrans plateforme — objets possédés, tenants & relance

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Object-browser admin (ADR 0030)

**Object-browser admin (ADR 0030).** `/platform/objects` (`AdminObjectsView`) = projection
PLATEFORME des **objets possédés** (généralise le level-switch à tout objet, pas que les
connecteurs). v1 = `datastore_namespace` : liste owner + nb rows + transfert (via `oto_resource`
op-aware, `POST /api/resources`). **Plan gouvernance only** — jamais le contenu des lignes
(lecture = view-as audité). Pensé pour se **dériver** du registre de capacités
(`GET /api/admin/capabilities`, JSON Schema des Input) — l'ossature accueille les autres types
sans réécriture. Réutilise `DataTable`/conventions admin existantes (pas de framework admin tiers,
TanStack présent mais inutilisé).

## Suivi des tenants (ADR 0052)

**Suivi des tenants (ADR 0052).** `/platform/tenants` (`AdminTenantsView`) = l'étage
d'identité AU-DESSUS des orgs : un tenant porte un émetteur dédié, des domaines, des orgs,
des comptes. Une ligne par tenant déclaré (`getAdminTenants(days)` → `/api/admin/tenants`),
fiche dépliée en place via deep-link `?tenant=<slug>` (`getAdminTenant`), fenêtre `?win=`
7/30/90 j. **Lecture seule, par construction** : déclarer un tenant est un runbook de
provisionnement côté backend (instance d'annuaire + client OAuth + hosts) et le registre
d'émetteurs y est bâti AU BOOT — d'où le verdict **« redémarrage requis »** (déclaré en base,
absent du registre ⟹ ses jetons sont encore rejetés) plutôt qu'un formulaire. Le verdict vit
dans **`lib/tenantVerdict.ts`** (testé, patron `connectorVerdict`) : une erreur n'y casse
aucun rendu, elle fait dire au tableau qu'un partenaire est servi. ⚠️ Les colonnes « orgs »
et « comptes » viennent de DEUX sources indépendantes côté backend (rattachement d'org vs
qualification du sub) — l'écart est la colonne « écarts », et la fiche en donne la liste
nominative. `CopyField` gagne un `label` optionnel + la classe `.copystack` (console.css)
pour les fiches techniques qui alignent plusieurs valeurs copiables.

## ⚠️ Relance des comptes inactifs — l'écran ne garde rien, il rend les gardes visibles

`/platform/outreach` (`AdminOutreachView`) est la console de la capacité `admin.outreach`
d'oto-backend. Elle poste sur `POST /api/admin/outreach`, **qui passe par exactement la même
autorisation et le même code que le verbe conversationnel `oto_admin_outreach`** : par
construction, l'écran ne peut rien contourner.

C'est la propriété qui rend cet écran acceptable, et il faut la garder telle quelle. **Les
cinq verrous vivent au serveur** ; le travail du front est de les rendre lisibles :

| verrou | où il vit | ce que l'écran en fait |
|---|---|---|
| tenant partenaire écarté | la requête SQL elle-même | rien — il n'y a pas de case à cocher, et c'est voulu |
| pas de doublon | index unique `(campagne, compte)`, écrit **avant** l'envoi — **plus** le regroupement de l'audience par **boîte mail** à la lecture | affiche `previous_outreach` pour qu'on sache qu'on écrit une 2ᵉ fois, et `accounts` quand des comptes ont fusionné |
| essai reçu avant tout envoi | `send` refuse sans essai de **cette empreinte**, pour **chaque** langue servie | n'arme `Envoyer` qu'après constat du serveur, et **re-verrouille dès qu'un caractère change** |
| nombre annoncé = nombre confirmé | `send` sans `confirm` refuse en donnant N ; un N qui ne colle plus refuse | la confirmation dit N, et c'est ce même N qui part |
| lien de désinscription | posé par le serveur dans chaque message | le dit, et signale que l'**aperçu** n'en porte pas (il n'a pas de destinataire) |

⚠️ **Un écran qui « simplifierait » en sautant l'essai ou la confirmation serait pire que pas
d'écran.** Il ne contournerait rien — le serveur refuserait — mais il aurait menti sur l'état
du garde, et c'est le mensonge qui coûte. `lib/outreach.ts` porte cette logique en fonctions
pures, et son spec fixe le SENS de chaque refus ; `AdminOutreachView.spec.ts` couvre le
câblage qu'aucun type ne protège (la retouche qui re-verrouille, le N confirmé,
la confirmation refusée qui n'envoie rien, les boutons **omis** — jamais grisés — pour qui
n'a pas le droit d'envoyer).

⚠️ **Une ligne = une BOÎTE MAIL, pas un compte** (corrigé le 2026-09-04). L'audience a
affiché deux fois la même personne : elle s'était inscrite deux fois avec la même adresse,
deux `sub`, deux lignes — donc deux mails dans une seule boîte. **L'index unique
`(campagne, compte)` ne pouvait rien y voir** : les comptes sont distincts, la contrainte
n'était pas violée. Le serveur regroupe désormais l'audience par adresse et sert une ligne
par boîte ; `accounts > 1` s'affiche sous l'adresse (« 2 comptes sur cette adresse — un seul
message »), parce qu'une **fusion muette** ferait lire une audience rétrécie comme un filtre
qui a trop mordu. Détail et mesures : `oto-backend/docs/relance-comptes.md`.

⚠️ **Le message est PRÉ-REMPLI** : `defaultContent()` (`lib/outreach.ts`) sert un brouillon
dans les deux langues plutôt qu'une page blanche. Deux choses à tenir :

- **la copy ne s'invente pas** — chaque phrase du brouillon porte sa source dans le
  commentaire de la fonction (site `i18n.ts`, locales de la console), et ce qui a été écrit
  pour cette relance est marqué comme tel. La voix est celle du funnel : **vouvoiement +
  minuscules**, pas le tutoiement de la console ;
- **pré-rempli n'est pas armé** : le contenu ne lève aucun verrou. Sans aperçu ni essai reçu,
  `Envoyer` reste fermé, et `AdminOutreachView.spec.ts` le fixe.

**Sur la langue, on ne devine pas.** Le seul signal est `users.locale`, la préférence d'UI
déclarée dans le dashboard ; elle prime toujours. Pour tout le reste, c'est `default_locale`,
un **choix d'opérateur** — l'écran l'initialise à l'anglais et affiche combien de comptes
tombent dans chaque cas. Le domaine de l'adresse est servi comme indication à l'œil et
n'entre dans **aucune** décision : un `.com` peut être français, un `.fr` une filiale. Le
tableau distingue donc « choisie par la personne » de « défaut de la campagne » — les
confondre ferait passer un choix d'opérateur pour une donnée de compte.

**Deux segments, un seul message.** `never_active` (aucun appel d'outil, jamais) et `dormant`
(a appelé, puis plus rien) sont deux requêtes distinctes, donc deux envois. Ce ne sont pas
deux campagnes : en gardant **le même nom de campagne et le même texte**, l'essai vaut pour
les deux et l'index unique continue de garantir qu'une personne n'est relancée qu'une fois.
L'écran mesure les deux segments ensemble et le dit, pour que la décision se prenne en
voyant les deux nombres.

⚠️ L'aperçu est rendu dans une **iframe `sandbox=""`** et non par `v-html` : le serveur rend
un **document complet** (`<head>`, fond, carte, pied), qu'une `div` mutilerait tout en
laissant ses styles fuir dans la console.

**Droits** : lire l'audience, l'aperçu et les registres = `platform_admin` (lentille de
supervision). Tout ce qui fait **partir** un mail (`test`, `send`) ou **lève** un refus
(`optout_clear`) = `super_admin`. Les boutons correspondants sont **omis** pour qui n'a pas
le droit, jamais grisés : un levier inerte se découvre au clic.

⚠️ `POST /api/admin/outreach` est **hors du document OpenAPI servi**, comme tout
`/api/admin/*` : les types de `types/api.ts` sont écrits à la main, relevés sur la capacité.
