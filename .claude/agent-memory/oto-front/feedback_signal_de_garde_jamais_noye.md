---
name: signal-de-garde-jamais-noye
description: Sur les écrans de flotte/agents, l'intervention d'une garde sur les données est LE signal prioritaire — en tête, en couleur, jamais rangé parmi les métriques
metadata:
  type: feedback
---

Quand un écran rend le travail d'un agent, **une garde qui a réparé, retiré ou perdu de
la donnée passe avant tout le reste** : en tête de carte, seule, en couleur, et cliquable
vers les travaux concernés. Ni dans une rangée de KPI, ni dans une fiche qu'il faut ouvrir.

**Why:** Alexis l'a posé mot pour mot le 2026-09-01 — « c'est le signal le plus important,
et il ne doit jamais être noyé ». La raison est mécanique, pas cosmétique : un travail dont
la garde a rattrapé les écritures se conclut `done`, **sans erreur**, et se range donc
visuellement avec les succès. Aucune alerte ne se déclenche. Si le signal partage la ligne
avec les jetons et les durées, il se lit une fois sur dix — et la campagne paraît propre
alors que le tableau ne l'est pas.

**How to apply:** vaut pour toute surface qui rend un résultat d'agent (flotte, file,
fiche, futurs écrans de run). Deux corollaires tirés de l'implémentation d'`/automations` :
le signal doit être **actionnable** (cliquer ouvre le travail fautif, sinon c'est une
alerte sans issue), et il doit **remonter au niveau de l'agrégat** — sur cent lignes, un
en-tête de groupe qui ne dit pas « N sous garde » oblige à parcourir les cent.

**Corollaire ajouté le 2026-09-01, et il est aussi important que la règle** : il y a
**deux** signaux, pas un. « La garde a rattrapé quelque chose » et « la garde n'a PAS
tourné » ne sont pas la même nouvelle, et ne se fondent jamais dans un même compteur — un
poste à `null` veut dire **non mesuré**, jamais zéro. Afficher « aucune destruction » là où
personne n'a regardé est précisément le défaut que ces postes existent pour empêcher. D'où
un second bloc, d'un autre ton : ni succès, ni échec. Et « vérifié sans rien trouver » se
dit aussi, discrètement — sans lui, « propre » et « pas regardé » se ressemblent.

Contexte du chantier et ce qui reste impossible : [[ui-flotte-automations-2026-09]].
Comment ce bandeau a pu rester muet pendant tout un lot : [[ecran-muet-est-une-hypothese]].
Détail technique et postes de garde : `oto-dashboard/docs/automations.md`.
