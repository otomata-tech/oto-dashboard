# Handoff — Mettre à jour le design system d'Oto (pour Alexis / Claude Code)

> À coller comme prompt dans Claude Code, à la racine de `oto-dashboard`. Objectif :
> porter la **direction validée** dans le repo, la **réutiliser au maximum** dans les vues
> existantes, et **verrouiller la discipline DRY** dans `CLAUDE.md` + une skill front.

---

## 0. Contexte & rôle

Tu es développeur front sur **oto-dashboard** (Vue 3 + Vite, `frontend/`). Le design system a
été retravaillé dans un projet dédié (« Oto Console Design System »). Source de vérité visuelle :
ce projet (README.md + `DESIGN-BRIEF.md` + `tokens/` + `components/`). Ta mission : **aligner le
repo** dessus, **remplacer les styles ad-hoc** par les tokens/classes/composants, et **empêcher
toute régression** via `CLAUDE.md` et une skill.

Ne réinvente rien : le langage visuel est figé ci-dessous. En cas de doute entre le repo et ce
document, **ce document gagne**.

---

## 1. Décisions de design à porter (non négociables)

**Direction « 2a » — contraste chaud.**

- **Sidebar encre foncée** (`--sidebar-bg: #2c2112`, texte crème) contre contenu clair. C'est LE
  geste d'identité. Item actif = **aplat saffron** (`#f0b41e`, texte encre).
- **Cartes** : surface blanche, **filet crème doux** `#ede1bd` + **ombre chaude** `--shadow-card`,
  jamais de bordure noire.
- **Rayons : deux valeurs seulement** — `8px` (tout conteneur : inputs, cartes, menus, kbd,
  segmented) et **pill** (tous les boutons, tags, dots, avatars). **Rien entre les deux.**
- **Boutons** : tous en **pill**, **casse normale** (« Se connecter », pas « se connecter » —
  retirer `text-transform: lowercase`).
- **Typo** : `Familjen Grotesk` (lecture/UI) + **`Spline Sans Mono`** (voix technique : eyebrows,
  labels, en-têtes de table, codes, compteurs — UPPERCASE tracké). **Retirer JetBrains Mono.**
  Labels/eyebrows en **poids 600** pour la lisibilité.
- **Contraste** : `--color-faint` assombri à **`#6d603f`** et `--color-mute` à **`#675a3c`**
  (les petits libellés doivent passer WCAG sur crème).
- **Icônes : Lucide** (déjà `@lucide/vue`). Retirer le set SVG dessiné à la main de `Icon.vue`.
- **Logo : « O ouvert »** (anneau à ouverture haut-droite, bouts arrondis en écho aux pills).
  SVG canonique :
  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 128 128"><circle r="44" fill="none" stroke="#f0b41e" stroke-width="28" stroke-linecap="round" stroke-dasharray="230 46" transform="rotate(-8)"/></svg>
  ```
  Décliner : mono saffron (défaut), sur fond encre (même saffron), état `think` = l'anneau tourne
  lentement à l'inverse des points d'orbite. Regénérer favicon.svg + PNG (32 / 180 / 512).
- **Motion** : `--t-fast: 180ms` + `cubic-bezier(.22,1,.36,1)` ; `.fadein` à l'entrée de vue ;
  respecter `prefers-reduced-motion` ; aucune boucle décorative infinie sur du contenu.

---

## 2. Étapes de mise à jour du repo (dans l'ordre)

1. **Tokens** — `frontend/src/assets/console.css` (`:root`) et `main.css` (`@theme`) :
   - Ajouter les tokens **sidebar** (`--sidebar-bg/-fg/-fg-strong/-fg-mute/-hair/-active-bg/-active-fg/-hover-bg`).
   - Assombrir `--color-mute` → `#675a3c`, `--color-faint` → `#6d603f`. Ajouter `--color-card-bd: #ede1bd`.
   - **Rayons** : réduire tout à `--radius-md: 8px` + `--radius-pill: 999px` ; supprimer les valeurs 7/10/12/14 et remplacer leurs usages.
   - Ajouter `--shadow-card` / `--shadow-pop`.
   - Police mono : `--font-mono: "Spline Sans Mono", ui-monospace, …` ; charger Spline Sans Mono, retirer JetBrains.
2. **Sidebar** — `.sb` : fond `--sidebar-bg`, textes `--sidebar-fg*`, `.sb-item.on` = aplat saffron.
   Adapter `ConsoleSidebar.vue`, `ConsoleIdentity.vue`, `ConsoleUserMenu.vue` (contrastes sur fond sombre).
3. **Boutons** — `.btn`/`.btn.ghost`/`.btn-mini`/`.linklike` : tout en `border-radius: 999px`,
   retirer `text-transform: lowercase`, passer les libellés en casse normale.
4. **Champs** — inputs/selects/textarea : `box-sizing: border-box`, radius 8px. **Radio** classique
   (anneau fin + point encre centré). **Select** en dropdown stylé (popover), pas le natif OS.
5. **Icônes** — remplacer `Icon.vue` par les composants Lucide (`@lucide/vue`), stroke 1.75.
   Mapper les noms utilisés (house, zap, plug, scroll-text, database, book-open, building-2, users,
   key-round, activity, shield, search, settings, mail, …).
6. **Logo/favicon** — remplacer `OtoMark`/médaillon par le « O ouvert » ci-dessus ; regénérer les favicons.
7. **Composants manquants** — porter en Vue ceux ajoutés au DS et absents du repo, au besoin :
   `Popover`, `SearchableSelect` (combobox avec recherche), `Alert`, `Badge`, `Spinner`, `Divider`,
   `Breadcrumb`, `Pagination`, `Accordion`, `Tooltip`, `Dialog`. Réutiliser shadcn-vue quand pertinent.
8. **Vérifier** chaque vue (`views/console/*`) : plus aucune valeur magique de rayon/couleur/ombre.

---

## 3. Réutilisation maximale (DRY design) — le cœur de la mission

- **Interdit** : réécrire un style qui existe déjà en classe `console.css` ou en composant. Toujours
  composer les primitives (`.card`, `.stat`, `.tag`, `.btn`, `Table`, `Dialog`, …).
- **Interdit** : valeurs en dur (`border-radius: 10px`, `#8a7c…`, `padding: 13px`) hors tokens.
  Toujours `var(--…)`.
- **Audit** : parcourir `views/console/*.vue` et `components/console/*.vue`, repérer les styles inline
  / scoped qui dupliquent une classe ou un token, et les remplacer.
- **Nouveau besoin ?** Si un motif revient ≥ 2 fois et n'existe pas, **créer un composant/classe**
  dans le DS (pas un one-off dans une vue), le documenter, puis l'utiliser. Ne pas hésiter à
  étendre le système — mais toujours *dans* le système.
- **Un sens = une couleur** : accents (saffron/terra/olive/cobalt) uniquement sémantiques.

---

## 4. À ajouter dans `CLAUDE.md` (bloc à coller)

```md
## Design system — règles front (DRY, non négociables)

Source de vérité visuelle : le projet « Oto Console Design System » (voir DESIGN.md + le DS).
Direction « 2a » : sidebar encre, cartes chaudes (filet doux + ombre, jamais de bord noir),
rayons **8px ou pill uniquement**, boutons **tous pill + casse normale**, typo Familjen Grotesk +
**Spline Sans Mono**, icônes **Lucide**, logo « O ouvert ».

- **Réutiliser avant d'écrire.** Toujours composer les classes `console.css` et les composants
  existants. Ne jamais redéfinir un style qui existe déjà.
- **Zéro valeur magique.** Couleurs, rayons, espacements, ombres, polices → uniquement via `var(--…)`.
  Rayons : `--radius-md` (8px) ou `--radius-pill`. Rien d'autre.
- **Accents = sens**, jamais décoratif. Icônes = Lucide, jamais de SVG dessiné à la main, jamais d'emoji.
- **Besoin récurrent (≥2×) manquant → créer un composant** dans le design system (documenté),
  puis l'utiliser. Étendre le système, jamais bricoler dans une vue.
- **Contraste** : petits libellés lisibles (mute `#675a3c`, faint `#6d603f`). Vérifier WCAG.
- Toute nouvelle vue rend **empty / error / loading** explicitement.
```

---

## 5. Skill front à créer — `.claude/skills/oto-frontend/SKILL.md`

```md
---
name: oto-frontend
description: Construire ou modifier une UI d'oto-dashboard en réutilisant au maximum le design system Oto (direction 2a). À invoquer pour toute tâche front (vue, composant, écran).
---

Avant d'écrire du style : chercher la classe `console.css` ou le composant existant qui fait déjà
le travail, et le réutiliser. N'écris un style neuf que si rien n'existe.

Règles :
1. Rayons **8px ou pill** uniquement (`--radius-md` / `--radius-pill`). Jamais d'entre-deux.
2. Boutons **tous pill**, casse normale. Sidebar **encre**, actif **saffron**.
3. Couleurs/espacements/ombres/polices **uniquement via tokens** (`var(--…)`). Zéro valeur en dur.
4. Icônes **Lucide** (`@lucide/vue`), stroke 1.75. Jamais de SVG maison, jamais d'emoji.
5. Accents (saffron/terra/olive/cobalt) **sémantiques** uniquement.
6. Besoin récurrent manquant → **créer un composant** dans le DS (documenté + storybook/card), puis l'utiliser.
7. Chaque vue : états **empty / error / loading** explicites (jamais de fallback silencieux).

Checklist de fin : (a) aucune valeur magique ; (b) composants réutilisés, pas dupliqués ;
(c) contraste des petits libellés OK ; (d) rendu correct des polices (Spline Sans Mono chargée).
```

---

## 6. Definition of done

- [ ] Tokens `console.css`/`main.css` alignés (couleurs assombries, rayons 8/pill, sidebar, ombres, Spline Sans Mono).
- [ ] Sidebar encre + actif saffron ; boutons pill + casse normale ; radio/select refaits ; inputs `border-box`.
- [ ] Icônes Lucide partout ; logo « O ouvert » + favicons regénérés.
- [ ] Composants manquants portés (Popover, SearchableSelect, Alert, Badge, Breadcrumb, Pagination, Accordion, …).
- [ ] Vues auditées : zéro valeur magique, primitives réutilisées.
- [ ] `CLAUDE.md` + skill `oto-frontend` en place.
- [ ] `npm run build` OK, revue visuelle des écrans clés (overview, connectors, org, data, détail, login).
```
