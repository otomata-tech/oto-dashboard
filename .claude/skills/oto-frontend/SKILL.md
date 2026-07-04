---
name: oto-frontend
description: Construire ou modifier une UI d'oto-dashboard en réutilisant au maximum le design system Oto (direction 2a). À invoquer pour toute tâche front (vue, composant, écran).
---

Source de vérité visuelle : `design-system/` (DS « Oto Console » livré par JB Fleury) —
lire `design-system/DESIGN-BRIEF.md` (le pourquoi) + `design-system/readme.md` (l'inventaire).
Doctrine d'usage des classes `console.css` : `DESIGN.md` (racine). En cas de doute entre le
repo et le brief, **le brief gagne**.

Avant d'écrire du style : chercher la classe `console.css` ou le composant existant qui fait déjà
le travail, et le réutiliser. N'écris un style neuf que si rien n'existe.

Règles :
1. Rayons **8px ou pill** uniquement (`--radius-md` / `--radius-pill`). Jamais d'entre-deux.
2. Boutons **tous pill**, casse normale. Sidebar **encre**, actif **saffron**.
3. Couleurs/espacements/ombres/polices **uniquement via tokens** (`var(--…)`). Zéro valeur en dur.
4. Icônes **Lucide** (`@lucide/vue`), stroke 1.75. Jamais de SVG maison, jamais d'emoji.
5. Accents (saffron/terra/olive/cobalt) **sémantiques** uniquement.
6. Besoin récurrent manquant → **créer un composant** dans le DS (documenté), puis l'utiliser.
7. Chaque vue : états **empty / error / loading** explicites (jamais de fallback silencieux).

Le DS est fourni en JSX/React comme référence de contrat (`.jsx` + `.d.ts` + `.prompt.md` +
`*.card.html`) — **porter en Vue**, ne pas copier tel quel. Les tokens (`design-system/tokens/*.css`)
sont la source des valeurs à répercuter dans `console.css` / `main.css`.

Checklist de fin : (a) aucune valeur magique ; (b) composants réutilisés, pas dupliqués ;
(c) contraste des petits libellés OK (WCAG) ; (d) rendu correct des polices (Spline Sans Mono chargée).
