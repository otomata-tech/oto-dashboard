---
title: Design system (sources & intégration)
type: reference
description: >-
  D'où vient le DS (brief JB déposé dans design-system/, catalogue d'usage DESIGN.md, le bri
  ef gagne en cas de conflit), la direction « 2a », les deux fichiers de tokens à ne pas con
  fondre, et l'état d'intégration barreau par barreau.
---

# Design system « Oto Console » — sources & état d'intégration

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Les deux fichiers de tokens (`main.css` vs `console.css`)

- Tokens Otomata (« Manuscrit chaud ») en CSS pur — **aucune dépendance à @otomata/ui**. ⚠️ Deux fichiers, ne pas confondre : `src/assets/main.css` (`@theme`) ne déclare que les **6 couleurs de base** (génération des utilitaires Tailwind) ; le **set complet** (`--color-surface`/`-bg`/`-ink-soft`/`-hair-soft`/`-paper-3` + tous les `-soft`/`-ink` des accents + `--ease-out`, classes `.o-medallion`/`.fadein`, keyframes `oto-pulse`) vit dans **`src/assets/console.css`**, importé global via `main.ts`, consommé par les vues console en `var(--…)`. Pour un écran console, piocher dans `console.css`.
- **Design system console : `DESIGN.md`** (racine repo) — catalogue d'usage des classes `console.css` (shell, card, grilles, stats, tables, tags sémantiques, boutons, états empty/error/loading, checklist nouvel écran) + tableau « marketing vs console » (mêmes tokens, deux dialectes à ne pas transplanter). Tokens « Manuscrit chaud » communs : `@otomata/ui` `THEME.md`.

## Sources de vérité & direction « 2a »

Source de vérité visuelle : le DS **« Oto Console »** livré par JB Fleury, déposé dans
**`design-system/`** (brief `design-system/DESIGN-BRIEF.md` = le *pourquoi*, à lire d'abord ;
inventaire `design-system/readme.md` ; tokens `design-system/tokens/*.css` ; composants de
référence en JSX/`.d.ts`/`.prompt.md`/`*.card.html`). Le catalogue d'usage des classes
`console.css` reste `DESIGN.md` (racine). En cas de conflit repo ↔ brief, **le brief gagne**.
Skill dédiée : `.claude/skills/oto-frontend`.

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
> écrans authentifiés (seul LoginGate vérifié au rendu). Plan : `design-system/handoff-alexis.md`.
