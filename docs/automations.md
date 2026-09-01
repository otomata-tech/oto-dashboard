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

Le **bandeau des postes de garde** est partagé par la carte Surveillance et la fiche
(`components/console/RunnerGardes.vue`) : il vivait en double, styles recopiés, et
l'arrivée d'un second état à peindre l'aurait fait diverger en triple.

La lecture d'un travail (dates, bail, renvois, gardes, `result`) est **centralisée dans
`lib/runnerJobs.ts`** ; celle du bail d'une **ligne** (qui la tient, jusqu'à quand, pour
quel run) dans **`lib/bailDeLigne.ts`** — deux objets différents, un bail sur la *file*
et un bail sur la *donnée*, que confondre ferait dire à l'un ce que seul l'autre sait. La
file elle-même vit dans le magasin partagé `composables/useRunnerJobs.ts`. Deux cartes qui appelleraient chacune `listRunnerJobs`
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
5. **Les agents qui traînent** : les travaux `claimed` les plus vieux. Depuis le
   2026-09-01, deux verdicts qu'on ne mélange pas, parce qu'ils n'ont pas la même force :
   **« bail dépassé » est un FAIT** (`lease_until` servi, comparé au statut) — le worker
   est parti, le job est re-claimable ; **« traîne » reste une PRÉSOMPTION**, tirée du
   seuil **dérivé de la campagne** (3 × le séjour médian observé), jamais une constante —
   une flotte dont le tour dure 20 s et une autre dont il dure 8 min n'ont pas le même
   « trop long ». Le seuil ne s'applique **jamais** à un travail qui porte un bail : sur
   celui-là le fait a déjà tranché, et une présomption qui contredirait une mesure sur la
   même ligne ferait douter des deux. Sans médiane **et** sans bail, la liste s'affiche
   **sans verdict** plutôt que d'accuser.
6. **Les postes non vérifiés**, dans un second bloc, d'un autre ton — voir le piège
   ci-dessous : « la garde n'a rien trouvé » et « la garde n'a pas tourné » ne sont pas
   la même nouvelle.

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

## Aller d'une ligne à son travail, et retour

Ajouté le 2026-09-01, avec `_claimed_run`. Les deux sens ne sont **pas** symétriques, et
c'est le point à retenir :

- **ligne → travail** : le bandeau de file de travail et la fiche d'une ligne
  (`DatastoreQueueBar.vue`, `RowDrawer.vue`) pointent vers **`/automations?run=<run>`** ;
  `RunnerJobsCard.vue` consomme la query et ouvre la fiche du travail dont `run_id`
  correspond. La cible est **consommée une fois** — sans ça, refermer la fiche la
  rouvrirait au tick suivant du magasin partagé, et elle deviendrait infermable. Si le run
  est **hors de la fenêtre** chargée, la carte le **dit** : un écran qui s'ouvre sur rien
  se lirait « ce run n'a jamais existé ».
- **travail → ligne** : seulement pour un travail **en cours**, et par la file de travail
  du tableau visé (`getNamespaceQueue`, on y cherche notre run). Sur un travail **conclu**,
  il n'y a rien à résoudre et l'écran l'écrit — voir « Ce que la carte ne montre pas ».

## Pièges vécus

⚠️ **Les horodatages arrivent en UTC SANS fuseau** (`2026-08-28 13:53:53`).
`Date.parse` les lit comme heure LOCALE : un travail de l'instant s'afficherait « il y a
2 h » l'été. Le fuseau est forcé avant de parser dans **`lib/runnerJobs.ts` (`instant()`)**
— déplacé là depuis `RunnerJobsCard.vue` le 2026-09-01, quand trois surfaces se sont mises
à lire les mêmes dates — et **toute nouvelle lecture de date doit passer par là**. Le même
piège a fait conclure à un ralentissement de campagne inexistant, en comparant une heure
UTC à une heure locale.

⚠️ **Les postes de garde sont des LISTES DE NOMS, pas des compteurs — et on les a lus
comme des entiers.** Le 2026-09-01, la première version de la carte les lisait par un
lecteur d'entier ; une liste lue par un lecteur d'entier vaut **zéro**. Résultat : le
bandeau de garde ne s'affichait **jamais**, sur aucun travail, alors que la production
servait déjà des destructions réelles (`valeurs_cliente_detruites: ["effectif",
"effectif_exact"]`). Le défaut se déguisait en bonne nouvelle — exactement ce que ces
postes existent pour empêcher. La leçon n'est pas « vérifier la forme » : c'est qu'un
écran de surveillance qui n'a **jamais rien montré** doit être suspecté avant d'être cru.
Le contresens est tenu par `lib/runnerJobs.spec.ts`, et la lecture ressort désormais
toute forme qu'elle **ne sait pas lire** (`illisible`) au lieu de la recompter zéro.

⚠️ **`null` ne veut pas dire « rien » : il veut dire QUE PERSONNE N'A REGARDÉ.**
`valeurs_cliente_detruites` a **trois** états, pas deux — une liste (ces colonnes ont été
détruites), `[]` (**mesuré**, rien de détruit), et `null` (**NON MESURÉ** : le harnais n'a
pas pu identifier la ligne travaillée, la garde n'a pas tourné). Afficher « aucune
destruction » là où rien n'a été mesuré est le pire des deux malentendus. D'où le second
bloc, d'un ton à part : ni succès, ni échec. Et « vérifié sans rien trouver » se dit aussi,
discrètement — c'est lui qui donne son prix au premier : sans lui, « propre » et « pas
regardé » se ressemblent.

⚠️ **`lease_until` ne se lit JAMAIS sans le statut.** Sur un travail conclu, la date est
le bail qui **était** tenu : vraie, simplement passée. L'afficher « expiré » accuserait de
mort un travail terminé normalement — et comme *tous* les travaux conclus portent une date
passée, la file entière virerait au rouge. Le croisement est tenu dans `bail()` et par un
test dédié.

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
- ⚠️ **La ligne qu'un travail CONCLU a travaillée.** C'est la seule chose de cette liste
  qui reste hors de portée, et il faut la dire précisément parce qu'elle ressemble à une
  chose qu'on sait faire. `_claimed_run` (servi depuis le 2026-09-01) répond « sur quelle
  ligne ce run est-il **MAINTENANT** » — **jamais** « laquelle a-t-il travaillée » : la
  colonne est effacée quand le run rend ses lignes. Sur un travail en cours, la fiche
  résout donc la ligne par la file de travail du tableau visé ; sur un travail conclu,
  **elle le dit à l'écran** au lieu de laisser un silence, qui se lirait « ce travail n'a
  touché aucune ligne ». Le lien pour les travaux conclus doit venir du harnais — c'est un
  lot `oto-runner`, pas d'ici, et déclarer une case que personne n'écrit la fabriquerait
  vide. La fiche lie par ailleurs au **tableau** (`payload.namespace`, via `/data/<nom>`
  qui accepte un nom et normalise en id) et à la ligne **visée** si le payload en porte la
  référence — ce chemin-là, lui, vaut aussi après la conclusion.
- **Le volume que la campagne visait** : il vit dans la déclaration de flotte, que l'API ne
  rend pas. La jauge porte sur les travaux vus, et la carte le dit.

## Contrats consommés

`listRunnerJobs(status?, limit)` · `getRunThread(run_id)` · `listRunnerTriggers()` ·
`setRunnerTriggerEnabled(id, on)` · `getConnectorInstances()` · `fireAutomation()` —
tous dans `api/console.ts`.

⚠️ **`RunnerJob['result']` est un contrat OUVERT, et c'est la clé de lecture de tout cet
écran.** Le schéma servi (`JobResult`, capacité `runner.jobs` côté oto-backend) se déclare
`extra=allow`. Il nomme aujourd'hui sept champs — `usage_tokens`, `stopped`, `steps`,
`tool_counts`, plus **les trois postes de garde** (`valeurs_cliente_reparees` /
`contacts_fabriques_retires` / `valeurs_cliente_detruites`), déclarés par oto-backend
**PR #723**. Tout le reste (`claims`, `writes`, `faux_depart`, `claim_vide`, `model`,
`usage_cache_*`, `hors_schema`, `rappels_contact`…) est **déclaré par le worker**
(`oto-runner`, hors de ce tree) et traverse le schéma sans y être décrit.

Trois conséquences pratiques :

- **`servi` n'est pas `déclaré`.** Les postes de garde étaient servis bien avant d'être
  déclarés : aucune forme n'était garantie nulle part, et c'est précisément là qu'on les a
  lus comme des entiers (voir les pièges). Un champ qui traverse `extra=allow` ne dit rien
  de sa forme — il faut aller la lire à la source qui l'écrit.
- les champs non déclarés **n'apparaissent pas dans l'OpenAPI**, donc pas dans
  `api.generated.ts` ; rien n'est jamais supposé présent, et **un champ inconnu n'est pas
  jeté** — il tombe dans « autres » sous sa clé brute.
- ⚠️ **`src/types/api.attendu.ts` est un fichier TEMPORAIRE**, et c'est le seul endroit du
  front qui type ce que la PR #723 sert (`_claimed_run`, `lease_until`, les trois postes).
  La PR est **ouverte, ni mergée ni déployée** : `npm run api:refresh` interroge le backend
  **en ligne** et **effacerait** ces champs. Ils sont donc écrits à la main, à part, dans
  un fichier qu'on **supprime d'un coup** le jour du déploiement — plutôt que trois
  déclarations semées dans le code qui survivraient à leur raison d'être. Cf.
  `docs/types-api.md`.

Le jour où d'autres de ces champs doivent devenir un contrat plutôt qu'une convention,
c'est `JobResult` qu'on resserre côté backend — pas ces types-ci qu'on complète.

`op=get` (lecture d'un job par id) **n'est pas consommé** : `list` et `get` projettent
exactement les mêmes colonnes, la fiche travaille donc sur le travail déjà chargé, sans
aller-retour qui n'apprendrait rien.
