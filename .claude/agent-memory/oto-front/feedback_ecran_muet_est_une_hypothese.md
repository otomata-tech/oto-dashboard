---
name: ecran-muet-est-une-hypothese
description: Un affichage conditionnel qui n'a JAMAIS rien montré doit être suspecté avant d'être cru — et la forme d'un champ se lit chez qui l'écrit, pas dans le schéma qui le laisse passer
metadata:
  type: feedback
---

Deux règles nouées par le même incident, le 2026-09-01.

**① Un bandeau d'alerte qui ne s'est jamais allumé n'est pas une bonne nouvelle : c'est une
hypothèse à éprouver.** J'ai livré la carte de surveillance `/automations` avec un bandeau
de postes de garde qui ne s'affichait **jamais** — sur aucun travail, alors que la
production servait déjà des destructions réelles. La cause : je lisais les postes avec un
lecteur d'entier, et **une liste lue par un lecteur d'entier vaut zéro**. Le défaut se
déguisait exactement en ce que l'écran était censé prouver.

**② `servi` n'est pas `déclaré`.** Ces champs traversaient un schéma `extra=allow` : ils
arrivaient au front sans qu'aucune forme soit garantie nulle part. J'avais typé
`number` de mémoire. La forme se lit **chez qui écrit le champ** (ici le worker, dans un
autre dépôt) ou dans **la donnée réelle** — jamais dans le schéma qui se contente de
laisser passer.

**Why:** ces deux écrans-là existent pour signaler qu'une garde a dû rattraper des données
clientes. Un travail sous garde se conclut `done`, sans erreur. Le seul témoin, c'était ce
bandeau — et il était muet. Un instrument de surveillance en panne est pire que pas
d'instrument : il certifie le calme.

**How to apply:** avant de livrer un affichage **conditionnel** (bandeau, alerte, badge,
compteur qui ne s'allume qu'au-dessus de zéro), le forcer à s'allumer au moins une fois —
sur une donnée réelle, ou par un test qui tient la forme servie. Et quand un champ vient
d'un contrat ouvert, aller chercher sa forme à la source qui l'écrit avant de le typer :
un sous-agent qui va lire le dépôt producteur, ou une lecture de données réelles, coûtent
moins qu'un écran qui ment. Corollaire de vocabulaire : distinguer toujours **« mesuré,
rien trouvé »** de **« pas mesuré »** — cf. [[signal-de-garde-jamais-noye]].
