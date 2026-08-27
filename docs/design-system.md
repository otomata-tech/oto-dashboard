---
title: Design system (sources & intégration)
type: reference
description: >-
  Où vit l'identité Otomata (oto-studio/brand/ → @otomata/ui) et pourquoi le dashboard ne s'y
   branche pas encore, la direction « 2a », les deux fichiers de tokens à ne pas confondre, e
  t l'état d'intégration barreau par barreau.
---

# Design system « Oto Console » — sources & état d'intégration

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Les deux fichiers de tokens (`main.css` vs `console.css`)

- Tokens Otomata (« Manuscrit chaud ») en CSS pur — **aucune dépendance à @otomata/ui**. ⚠️ Deux fichiers, ne pas confondre : `src/assets/main.css` (`@theme`) ne déclare que les **6 couleurs de base** (génération des utilitaires Tailwind) ; le **set complet** (`--color-surface`/`-bg`/`-ink-soft`/`-hair-soft`/`-paper-3` + tous les `-soft`/`-ink` des accents + `--ease-out`, classes `.o-medallion`/`.fadein`, keyframes `oto-pulse`) vit dans **`src/assets/console.css`**, importé global via `main.ts`, consommé par les vues console en `var(--…)`. Pour un écran console, piocher dans `console.css`.
- **Design system console : `DESIGN.md`** (racine repo) — catalogue d'usage des classes `console.css` (shell, card, grilles, stats, tables, tags sémantiques, boutons, états empty/error/loading, checklist nouvel écran) + tableau « marketing vs console » (mêmes tokens, deux dialectes à ne pas transplanter). Tokens « Manuscrit chaud » communs : `@otomata/ui` `THEME.md`.

## Sources de vérité & direction « 2a »

**L'identité Otomata se définit dans `oto-studio/brand/`** (repo public `otomata-tech/oto-studio`)
— palette, typo, logos, tokens, charte formelle. Elle s'implémente pour les frontends dans
**`@otomata/ui`** (`oto-websites/packages/ui/`), et la règle de la plateforme est :
**un nouveau frontend prend les tokens par `import "@otomata/ui/src/theme.css"`**, il ne les
recopie pas.

⚠️ **Le dashboard ne suit PAS encore cette règle** : ses tokens sont écrits en dur dans
`console.css` (aucune dépendance à `@otomata/ui`, ADR 0007). Le branchement est **un lot à part,
à décider** — ne pas l'improviser au détour d'un écran. En attendant, une évolution de charte part
de `oto-studio/brand/` et se porte à la main dans `console.css`.

Le *pourquoi* de la direction artistique — palette « Manuscrit chaud », direction « 2a » — vit
dans **`oto-studio/brand/charte-doc/DESIGN-BRIEF.md`** (§0-3 ; ses §4-8 inventorient un design
system archivé, cf. la note datée en bas de page). Le catalogue d'usage des classes `console.css`
reste `DESIGN.md` (racine). Skill dédiée : `.claude/skills/oto-frontend`.

Direction **« 2a »** : sidebar **encre** (`--sidebar-bg #2c2112`, texte crème ; actif = aplat
saffron), cartes chaudes (filet doux `#ede1bd` + `--shadow-card`, **jamais de bord noir**),
rayons **8px ou pill uniquement**, boutons **tous pill + casse normale**, typo Familjen Grotesk +
**Spline Sans Mono** (voix technique, retirer JetBrains Mono), icônes **Lucide** (`@lucide/vue`),
logo **« O ouvert »**.

## État d'intégration (poussé + déployé le 2026-07-04)

> **État d'intégration (poussé + déployé le 2026-07-04).**
> Faits : **b1** fondations tokens (couleurs WCAG, rayons md/pill, sidebar/ombres, Spline Sans
> Mono) · **b2** sidebar encre (item actif saffron) · **b3** retrait du lowercase forcé sur les
> boutons · **b4** champs (focus saffron, skin select natif, repli des classes ad-hoc sur `.inp` —
> variantes `.inp.sm`/`.inp:disabled` ajoutées) · **b5** icônes Lucide (`Icon.vue`, API inchangée) ·
> **b6** logo « O ouvert » (`lib/mark.ts`, `.o-medallion`) + favicons régénérés · **recapitalisation**
> des libellés de boutons (casse de phrase sur les CTA ; segmented/tabs/chips restent lowercase —
> voix « jeton »). Restent : **b7** composants manquants (Popover, SearchableSelect, Alert, Badge,
> Breadcrumb, Pagination, Accordion… — à porter au fil des besoins) · **b8** audit des scoped-styles
> (rayons magiques résiduels ; fait sur les composants partagés + 2 vues) · recapitaliser
> `ContextProfileCard`/`DataView`/`OrgView` (exclus le 04/07, WIP parallèle) · revue visuelle des
> écrans authentifiés (seul LoginGate vérifié au rendu). Plan : `handoff-design-system.md`.

## 2026-08-27 — `design-system/` archivé

**Ce doc a désigné `design-system/` comme source de vérité visuelle jusqu'au 2026-08-27.** C'était
vrai à l'écriture : le dossier portait le design system « Oto Console » (brief, tokens, guidelines,
54 composants React de référence, un UI kit d'écrans) et le front s'alignait dessus.

Ça ne l'est plus. Décision du 27/08 : **le futur design system du produit sera celui du nouveau
front** — maintenir en parallèle un design system dashboard n'avait plus d'objet. Le dossier a été
supprimé du repo (178 fichiers, 1,1 Mo) ; l'historique git le conserve. Dernier commit où il est
complet : **`53c0802`** — `git show 53c0802:design-system/readme.md`,
`git checkout 53c0802 -- design-system/` pour tout ressortir.

Où est parti quoi :

| | |
|---|---|
| **Marque** — tokens, guidelines, composants de marque (`OtoMark`/`Medallion`/`Avatar`), explorations d'identité, brief de direction artistique | **`oto-studio/brand/`** (`theme/dashboard-tokens/`, `charte-doc/`) — la source de vérité déclarée |
| **Cahiers des charges** — le plan de portage, la refonte UX des pages Projet | ici, `handoff-design-system.md` et `refonte-pages-projet.md` |
| **Maquettes d'écrans produit** — 133 fichiers JSX/HTML de prototypage + l'UI kit console | supprimés (historique git) |
| **Outillage** — les deux README du dossier, la skill `oto-design` | supprimés (historique git) |

Ce qui **n'a pas changé** : la direction « 2a » décrite plus haut est toujours celle du dashboard
servi, et `console.css` + `DESIGN.md` restent le contrat de ses écrans.
