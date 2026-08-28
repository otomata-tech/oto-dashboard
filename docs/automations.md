# `/automations` — surveiller les agents hébergés

L'écran de surveillance des agents qui tournent **pour** l'utilisateur, sans lui : la
file d'exécution, les déclencheurs programmés, et les routines Claude Code
déclenchables à la main. Route `/automations`, vue `views/console/AutomationsView.vue`.

Trois cartes, dans cet ordre — ce qui tourne d'abord, ce qui part tout seul ensuite,
ce qu'on déclenche soi-même en dernier :

| carte | composant | ce qu'elle montre |
|---|---|---|
| File d'exécution | `components/console/RunnerJobsCard.vue` | les travaux des agents hébergés : état, durée, coût, fil |
| Déclencheurs programmés | `components/console/RunnerTriggersCard.vue` | quelle procédure part quand, et son robinet |
| Automatisations | dans la vue | les routines Claude Code, une par instance du connecteur `routine` |

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
- **Ligne de synthèse** : jetons facturés, jetons lus en cache **comptés à côté** (sinon
  un run à gros cache paraît gratuit), durée médiane, réservations sans écriture.
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

## Pièges vécus

⚠️ **Les horodatages arrivent en UTC SANS fuseau** (`2026-08-28 13:53:53`).
`Date.parse` les lit comme heure LOCALE : un travail de l'instant s'afficherait « il y a
2 h » l'été. La carte force le fuseau avant de parser (`instant()`), et **toute nouvelle
lecture de date doit passer par là**. Le même piège a fait conclure à un ralentissement
de campagne inexistant, en comparant une heure UTC à une heure locale.

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

## Contrats consommés

`listRunnerJobs(status?, limit)` · `getRunThread(run_id)` · `listRunnerTriggers()` ·
`setRunnerTriggerEnabled(id, on)` · `getConnectorInstances()` · `fireAutomation()` —
tous dans `api/console.ts`. Le type `RunnerJob['result']` porte plus que ce que l'écran
affiche (`claims`, `writes`, `faux_depart`, `model`, `usage_cache_*`) : ces champs sont
déclarés parce qu'ils servent à distinguer un tour perdu d'un succès.
