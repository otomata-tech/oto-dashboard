# `/automations` — surveiller les agents hébergés

L'écran de surveillance des agents qui tournent **pour** l'utilisateur, sans lui : la
file d'exécution, les déclencheurs programmés, et les routines Claude Code
déclenchables à la main. Route `/automations`, vue `views/console/AutomationsView.vue`.

Quatre cartes, du général au particulier — l'état de la flotte d'abord, le travail
individuel ensuite, ce qui part tout seul, puis ce qu'on déclenche soi-même :

| carte | composant | ce qu'elle montre |
|---|---|---|
| Surveillance | `components/console/RunnerMonitorCard.vue` | l'état de la flotte : gardes, avancement, coût, renvois, agents bloqués |
| File d'exécution | `components/console/RunnerJobsCard.vue` | les travaux, groupés par flotte : état, séjour, coût |
| Déclencheurs programmés | `components/console/RunnerTriggersCard.vue` | quelle procédure part quand, et son robinet |
| Automatisations | dans la vue | les routines Claude Code, une par instance du connecteur `routine` |

Plus une **fiche**, ouverte depuis n'importe quelle des deux premières :
`components/console/RunnerJobDetail.vue`.

La lecture d'un travail (dates, renvois, gardes, `result`) est **centralisée dans
`lib/runnerJobs.ts`**, et la file elle-même dans le magasin partagé
`composables/useRunnerJobs.ts`. Deux cartes qui appelleraient chacune `listRunnerJobs`
afficheraient deux instantanés à 30 s d'écart côte à côte — un compteur qui contredit la
liste juste en dessous fait douter des deux.

## Le grain : ordonnanceur, pas donnée

**La file montre des TRAVAUX, pas des lignes de tableau.** Un travail est un run
d'agent : il réserve une ligne, la traite, écrit, la relâche. Le grain donnée — quelle
ligne est sous bail, dans quel état — vit sur la home projet et la page tableau.
Confondre les deux fait lire un tour perdu comme un succès.

Trois étages, à ne pas confondre quand on lit l'écran ou qu'on en parle :

- **l'ordonnanceur de flotte** dépose les travaux dans une file, en gardant N en vol ;
- **les agents** (processus permanents côté serveur) y piochent, font tourner le
  modèle, et reviennent en chercher un autre ;
- **le MCP** leur sert les outils pendant ce temps.

L'écran ne voit que la file. **Un agent mort ne s'y voit pas directement** : le signe
est le nombre de travaux en vol, et il se lit plusieurs fois — un instantané à 2 sur 3
est normal entre deux réservations.

## Ce que la carte de file rend, et pourquoi

Refondue le 2026-08-28. Avant : une liste plate où chaque ligne répétait le nom de la
procédure et « worker : ton compte ». Sur une campagne, cent lignes identiques à l'œil,
et rien pour répondre aux trois questions qu'on se pose devant : **combien tourne,
depuis quand, combien ça coûte.**

Principe : **ce qui est COMMUN monte dans l'en-tête du groupe, ce qui DISTINGUE reste
sur la ligne.**

- **Les compteurs par état SONT les filtres** — une rangée au lieu de deux. Ils comptent
  sur toute la population chargée, jamais sur le sous-ensemble filtré : un compteur qui
  bouge quand on clique dessus ne compte plus rien.
- **Regroupement par flotte**, que le travail portait déjà sans qu'on l'affiche : nom,
  procédure, tableau, en-cours/attente/conclus/échecs, débit horaire, coût, et une
  **jauge d'avancement**. Le dénominateur est le nombre de travaux VUS, pas le volume
  visé — celui-ci vit dans la déclaration de flotte, que l'API ne rend pas ; mieux vaut
  un dénominateur vrai et partiel qu'un total supposé.
- **Le débit reste muet sous deux travaux conclus** ou sur une fenêtre trop courte : un
  débit calculé sur un point est faux.
- **Durée par travail, qui avance à l'écran.** « En cours depuis 2 min » et « depuis
  40 min » demandent deux réactions opposées, et la date de création seule ne les
  distingue pas.
- **Le worker n'apparaît que si ce n'est PAS vous** — le cas où l'information compte.
- **Le tour perdu est nommé** (« réservé, rien écrit ») : il ne lève aucune erreur, et
  sans libellé il passe pour un succès.

Repris le 2026-09-01, à l'arrivée de Surveillance et de la fiche. Trois choses ont bougé,
pour la même raison — **dire une chose UNE fois, à l'endroit où elle se lit** :

- **la ligne de synthèse est partie dans Surveillance** : deux totaux de la même
  population sur un même écran, c'est une occasion de se contredire ;
- **le fil déplié sous la ligne est devenu la fiche** : le fil n'était qu'une part de ce
  qu'il y a à voir, et le déplier poussait le reste de la file hors de l'écran ;
- **le chargement est passé au magasin partagé.**

La ligne gagne au passage deux marques qui n'attendent pas l'ouverture de la fiche : le
**compte de gardes** (bordure teintée + pastille) et le **nombre de renvois**.

## Ce que Surveillance rend, et dans quel ordre

Ajoutée le 2026-09-01. La file répond à « où en est CE travail » ; elle ne répondait pas
à **« est-ce que la campagne va bien »**, qui est la question qu'on se pose réellement
devant cent lignes — il fallait la reconstituer de tête, ligne par ligne.

**L'ordre de la carte EST son propos**, et il n'est pas négociable :

1. **Les gardes, en tête, seules et en couleur.** C'est le seul bloc coloré. Un travail
   dont la garde a réparé les écritures se conclut **`done`, sans erreur** : il se range
   visuellement avec les succès. Rangé sous les jetons et les durées, ce signal se lit une
   fois sur dix ; en tête, il se lit toujours. Les travaux touchés sont **cliquables** —
   le signal ouvre sur le geste, il n'est pas qu'une alerte.
2. **Les mesures** : écritures **sur lignes réservées** (le seul dénominateur exact que
   l'API rende — voir plus bas), en cours / en attente, jetons facturés et lus en cache,
   séjour médian.
3. **La composition de la fenêtre** en une barre empilée : conclus / en échec / en
   cours / en attente.
4. **Les renvois du harnais**, avec une distinction qui change le diagnostic :
   `attempts` s'incrémente à **chaque** prise, reprise d'un bail mort comprise. Un renvoi
   **avec** motif (`last_error`) est un échec de l'agent ; un renvoi **sans** motif est un
   **worker mort en cours de bail** — personne n'a rien écrit, et ça ne se soigne pas
   pareil.
5. **Les agents qui traînent** : les travaux `claimed` les plus vieux. Le seuil d'alerte
   est **dérivé de la campagne** (3 × le séjour médian observé), jamais une constante —
   une flotte dont le tour dure 20 s et une autre dont il dure 8 min n'ont pas le même
   « trop long ». Sans médiane, la liste s'affiche **sans verdict** plutôt que d'accuser.

## La fiche d'un agent

`RunnerJobDetail.vue`, ouverte depuis la file ou depuis Surveillance. Mêmes partis pris :
**les gardes avant l'identité même du travail** (ouvrir sur un id et des horodatages fait
refermer avant le seul fait qui comptait), puis l'échec en toutes lettres, l'identité, ce
que le travail visait (le `payload`), ce qu'il a produit (le `result`), et son fil.

**Le `result` est rendu en TROIS temps**, parce que son contrat est ouvert :

1. les **postes qu'on sait nommer** (lignes réservées, écritures, colonnes hors schéma,
   étapes, motif d'arrêt traduit, modèle, jetons) ;
2. le **relevé d'outils**, trié du plus appelé au moins ;
3. **tout le reste, sous sa clé brute.**

Le troisième temps n'est pas de la complaisance : `JobResult` est `extra=allow` côté
backend (cf. plus bas). Sans lui, un champ que le worker vient d'ajouter reste invisible
jusqu'à ce qu'on pense à le déclarer ici — et « l'écran ne le montre pas » se lit « le
worker ne le produit pas », le pire des deux malentendus. `lib/runnerJobs.spec.ts` tient
la règle.

## Pièges vécus

⚠️ **Les horodatages arrivent en UTC SANS fuseau** (`2026-08-28 13:53:53`).
`Date.parse` les lit comme heure LOCALE : un travail de l'instant s'afficherait « il y a
2 h » l'été. Le fuseau est forcé avant de parser dans **`lib/runnerJobs.ts` (`instant()`)**
— déplacé là depuis `RunnerJobsCard.vue` le 2026-09-01, quand trois surfaces se sont mises
à lire les mêmes dates — et **toute nouvelle lecture de date doit passer par là**. Le même
piège a fait conclure à un ralentissement de campagne inexistant, en comparant une heure
UTC à une heure locale.

⚠️ **Le fil d'un run n'a pas la même forme selon le chemin d'exécution.** Le chemin
stateless appose du `text` ; celui qui délègue la boucle d'outils au fournisseur appose
du `content` accompagné d'un relevé d'outils. La vue lisait `text` seul et affichait
« — » sur chaque tour d'un fil pourtant plein. `resume()` accepte désormais les deux.

⚠️ **Un fil vide n'est pas une panne.** Quand la boucle d'outils tourne chez le
fournisseur, le verbatim des tours ne nous revient pas — le fil ne garde que l'ordre et
une synthèse. La carte le dit explicitement, sans quoi le dépliant semble cassé.

⚠️ **Une page absente de `PAGE_META` retombe SILENCIEUSEMENT sur l'overview.**
`/automations` a affiché « overview » comme titre alors que ses libellés existaient déjà
dans les deux locales : il ne manquait qu'une ligne dans la table. Rien ne cassait, rien
n'alertait, et le titre mentait. `lib/consoleNav.spec.ts` tient désormais la règle :
tout écran de la nav a son titre, tout titre ses deux traductions.

## Ce que la carte ne montre pas, et pourquoi

- **Le résultat métier d'un run** — il vit dans le tableau que l'agent a écrit, pas
  dans la file. Un travail « terminé » ne dit pas qu'une fiche est bonne.
- **Le contenu des routines Claude Code** : la page déclenche et renvoie vers la
  session. Le résultat se lit chez Anthropic ; prétendre l'afficher ici serait mentir.
- **La progression réelle d'une campagne** : le volume visé n'est pas exposé. La jauge
  porte sur les travaux vus, et la carte dit « sur les N derniers ».
- **La ligne qu'un agent a travaillée**, sauf si le `payload` la nomme. Le lien existe en
  base (`datastore_rows.claimed_run` porte le `run_id` du travail) mais **n'est pas
  projeté** : `_row_to_dict` ne sert que `_claimed_by` et `_claimed_until`. La fiche lie
  donc au **tableau** (`payload.namespace`, via `/data/<nom>` qui accepte un nom et
  normalise en id) et à la ligne **seulement** si le payload en porte la référence. Rien
  n'est deviné : sans chemin honnête, on n'affiche pas de lien.
- **Le bail d'un travail en cours.** `lease_until` existe en base et n'est rendu que par
  `op=claim` — les projections `list` et `get` ne le portent pas. On ne peut donc pas dire
  « ce bail a expiré », seulement « ce travail traîne » ; d'où un seuil dérivé du séjour
  médian plutôt qu'une comparaison au bail.

## Contrats consommés

`listRunnerJobs(status?, limit)` · `getRunThread(run_id)` · `listRunnerTriggers()` ·
`setRunnerTriggerEnabled(id, on)` · `getConnectorInstances()` · `fireAutomation()` —
tous dans `api/console.ts`.

⚠️ **`RunnerJob['result']` est un contrat OUVERT, et c'est la clé de lecture de tout cet
écran.** Le schéma servi (`JobResult`, capacité `runner.jobs` côté oto-backend) ne nomme
que **quatre** champs — `usage_tokens`, `stopped`, `steps`, `tool_counts` — et se déclare
`extra=allow`. Tout le reste (`claims`, `writes`, `faux_depart`, `claim_vide`, `model`,
`usage_cache_*`, `hors_schema`, et **les trois postes de garde**
`valeurs_cliente_reparees` / `contacts_fabriques_retires` / `valeurs_cliente_detruites`)
est **déclaré par le worker** (`oto-runner`, hors de ce tree) et traverse le schéma sans y
être décrit.

Deux conséquences pratiques :

- ces champs **n'apparaissent pas dans l'OpenAPI**, donc pas dans `api.generated.ts` :
  c'est l'une des rares interfaces encore écrite à la main, et elle porte sa raison en
  commentaire, conformément à `docs/types-api.md` ;
- rien n'est jamais supposé présent, et **un champ inconnu n'est pas jeté** — il tombe
  dans « autres » sous sa clé brute.

Le jour où ces champs doivent devenir un contrat plutôt qu'une convention, c'est
`JobResult` qu'on resserre côté backend — pas ce type-ci qu'on complète.

`op=get` (lecture d'un job par id) **n'est pas consommé** : `list` et `get` projettent
exactement les mêmes colonnes, la fiche travaille donc sur le travail déjà chargé, sans
aller-retour qui n'apprendrait rien.
