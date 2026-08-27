---
title: Écrans plateforme
type: reference
description: >-
  `/platform/objects` (object-browser des objets possédés, ADR 0030, plan gouvernance only) 
  et `/platform/tenants` (l'étage d'identité au-dessus des orgs, ADR 0052, lecture seule par
   construction, verdict « redémarrage requis »).
---

# Écrans plateforme — objets possédés & tenants

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
