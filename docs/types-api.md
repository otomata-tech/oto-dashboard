---
title: Les types d'API viennent de l'OpenAPI
type: reference
description: >-
  Le dashboard ne recopie plus les contrats d'oto-backend à la main : il les dérive du docum
  ent OpenAPI servi par le backend. La chaîne (Output → openapi.json → snapshot → types géné
  rés → alias), les deux contrôles CI, et ce qui reste écrit à la main — avec pourquoi.
---

# Les types d'API viennent de l'OpenAPI

> Posé le 2026-08-27. Avant : `src/types/api.ts` portait 137 interfaces écrites à la
> main, présentées comme « reflétant les handlers de oto-mcp ». Un miroir qu'aucun test
> ne relie à sa source ne casse rien à l'écran quand il dévie — **il fait mentir l'UI**,
> exactement comme `lib/keyStack.ts` (cf. `CLAUDE.md` § Règles transverses).

## La chaîne

```
oto-backend                          oto-dashboard
───────────                          ─────────────
Capability(Output=…)   ─┐
                        ├─▶ GET /api/openapi.json ─▶ openapi/oto-openapi.json   (snapshot commité)
routes écrites à la main┘   (dérivé du serveur                │
                             à chaque requête)                ▼
                                                 src/types/api.generated.ts    (généré, commité)
                                                              │
                                                              ▼
                                                 src/types/api.ts               (alias nommés)
                                                              │
                                                              ▼
                                                        les écrans
```

Le maillon qui compte est le premier : **une capacité qui ne déclare pas son `Output`
n'apparaît nulle part en aval**, et son type revient à être écrit à la main ici. Corriger
un type du dashboard commence donc, presque toujours, côté backend.

## Les commandes

| commande | ce qu'elle fait |
|---|---|
| `npm run api:gen` | régénère `src/types/api.generated.ts` depuis le **snapshot commité**. Hors ligne, reproductible. |
| `npm run api:check` | ne réécrit rien : régénère en mémoire et **sort 1 avec le diff** si le fichier commité a dérivé. C'est le contrôle du CI. |
| `npm run api:refresh` | va chercher le document sur un backend **vivant** (prod par défaut ; `OTO_MCP_BASE=https://mcp.oto.ninja` pour la preprod), réécrit le snapshot **et** les types. |

`api:refresh` est un acte volontaire, jamais un `prebuild` : rafraîchir le snapshot change
le contrat auquel le dashboard se compile. **Le diff produit EST l'information** — il dit
ce que le backend a changé depuis la dernière fois.

## Les deux contrôles, et pourquoi ils sont deux

- **`npm run api:check`, dans le job `test`** (bloquant, sur PR comme sur tag) : le fichier
  généré commité correspond-il au snapshot commité ? Hors ligne, donc il mesure une
  dérive réelle et pas la disponibilité du backend.
- **`.github/workflows/openapi-drift.yml`** (hebdomadaire, non bloquant) : le snapshot
  commité correspond-il encore à ce que **sert la prod** ? Rouge = le contrat a bougé et le
  dashboard se compile contre un contrat périmé. Réponse : `npm run api:refresh`, relire le
  diff, commiter.

Les mettre dans le même contrôle rendrait une PR rouge parce qu'un backend a été déployé
ailleurs — ou verte parce que le réseau était coupé. Ce sont deux questions différentes.

## Ce qui reste écrit à la main — les trois raisons, plus un cas à part

Un type reste dans `api.ts` sous forme d'interface, avec la raison en commentaire :

1. **`/api/admin/*` est hors du document servi.** Le préfixe admin est exclu de
   `openapi.json` : tout l'écran plateforme (`/platform/*`) est donc à la main, et le
   restera tant que ces opérations ne seront pas exposées.
2. **La capacité ne déclare pas son `Output`** (dette côté backend, `tests/capability_output_debt.txt`).
   L'opération apparaît dans le document, sa réponse est un `200: OK` nu.
3. **Le contrat servi est plus LÂCHE que ce que l'écran suppose** — champ déclaré
   `Optional[...] = None` côté Pydantic alors qu'il est toujours servi, ou `str` là où le
   domaine est un ensemble fermé. Adopter le type généré tel quel ne corrigerait pas
   l'écran, il le dégraderait (un `| null` à absorber partout, une union de littéraux
   perdue). **Le correctif est en amont** : resserrer l'`Output`.

> **Règle.** On n'écrit plus d'interface d'API à la main dans ce repo. Un besoin non
> couvert par le document se traite côté backend (déclarer ou resserrer l'`Output`), puis
> `npm run api:refresh` ici. Écrire l'interface à la main est le dernier recours, et il
> se justifie dans le commentaire du bloc par l'une des trois raisons ci-dessus.

### Le cas à part : `src/types/api.attendu.ts` (TEMPORAIRE)

Une quatrième situation, qui n'est **pas** une exception à la règle mais un **sas** : le
backend sert déjà des champs qu'on veut consommer, **sur une PR ouverte, ni mergée ni
déployée**. Le document OpenAPI en ligne ne les porte donc pas encore, et
`npm run api:refresh` — qui interroge un backend **vivant** — les **effacerait**.

Ces champs vont dans **`src/types/api.attendu.ts`**, à part du reste, avec en tête la PR
d'où ils viennent. La forme du fichier est le point : on le **supprime d'un coup** le jour
du déploiement, au lieu de retrouver trois déclarations semées dans le code qui
survivraient à leur raison d'être. Les interfaces qui les consomment les prennent par
`extends` / intersection, jamais en recopiant les champs.

**À la fusion de la PR** : `npm run api:refresh`, vérifier que le document régénéré porte
bien ces champs, basculer les usages sur les types générés, supprimer le fichier.

État au 2026-09-01 : il porte `_claimed_run` (le run qui tient une ligne), `lease_until`
(le bail d'un travail) et les trois postes de garde de `JobResult` — oto-backend PR #723.
⚠️ Les postes de garde y sont des **`string[]`**, et `valeurs_cliente_detruites` vaut
`null` quand la garde **n'a pas tourné** : les typer autrement a déjà rendu un écran de
surveillance muet (cf. `docs/automations.md`).

## Un défaut du document qu'il faut connaître

Le document servi **viole l'unicité des `operationId`** : `me_guides_get_get` et
`me_guides_set_put` sont portés chacun par trois chemins (`/api/me/…`, `/api/orgs/{id}/…`,
`/api/groups/{id}/…`). Or `operations` est un objet indexé par cet identifiant : le
générateur produit alors un fichier **qui ne compile pas** (TS2300 + TS2717), et l'erreur
apparaît à 8 000 lignes de sa cause.

`scripts/openapi-types.mjs` ne choisit pas de gagnant : il **retire l'`operationId` des
occurrences en conflit**, ce qui fait typer ces opérations directement sous `paths[…]`
(chacune avec ses vrais paramètres — rien n'est perdu, rien n'est arbitré), et il annonce
la normalisation à chaque exécution. Elle redeviendra un no-op le jour où le backend
nommera ces opérations distinctement. **C'est là qu'est le correctif.**

Conséquence pratique : `npx openapi-typescript openapi/oto-openapi.json` à la main ne
produit PAS le fichier commité. L'entrée est `npm run api:gen`.

## État mesuré au 2026-08-27

Sur les 137 interfaces de `api.ts` et les 240 opérations du document servi :

| | nb |
|---|---:|
| opérations du document | 240 (dont **166** avec un schéma de réponse déclaré) |
| schémas nommés (`components`) | 74, + ~145 formes décrites sur l'opération sans nom global |
| **interfaces devenues des alias** (le type vient du backend) | **36** |
| candidats refusés par le typecheck — contrat plus lâche que l'écran | 22 |
| sans équivalent — `/api/admin/*` hors document | 15 |
| sans équivalent — capacité sans `Output` déclaré | 11 |
| sans équivalent — types imbriqués ou vues purement front | 53 |

Les 22 refus ne sont pas 22 problèmes indépendants : plusieurs sont des **enveloppes
bloquées par un seul enfant** (`GroupDetail` par `GroupMember`, `Inbox` par `InboxInvite`,
`EmailSettingsBundle` par ses blocs). Resserrer un schéma en débloque souvent deux.

Le détail par champ — ce que l'écran suppose face à ce que le contrat déclare — est dans la
PR qui a posé ce mécanisme : c'est la matière des tickets `Output` côté oto-backend.
