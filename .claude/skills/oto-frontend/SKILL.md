---
name: oto-frontend
description: Construire ou modifier une UI d'oto-dashboard en réutilisant au maximum le design system Oto (direction 2a). À invoquer pour toute tâche front (vue, composant, écran).
---

Contrat des écrans servis : `DESIGN.md` (racine) + `frontend/src/assets/console.css`. L'identité
Otomata, elle, se définit dans `oto-studio/brand/` (repo public `otomata-tech/oto-studio`) — le
*pourquoi* de la direction « 2a » y est, dans `charte-doc/DESIGN-BRIEF.md` (§0-3).
⚠️ Le dossier `design-system/` du repo a été **archivé le 2026-08-27** : ses renvois ne résolvent
plus, et le futur design system du produit sera celui du nouveau front. Contexte :
`docs/design-system.md`.

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

Les valeurs de tokens ont leur archive dans `oto-studio/brand/theme/dashboard-tokens/` ; elles
vivent, elles, dans `console.css` / `main.css`. Une évolution de charte part de `oto-studio/brand/`
et se porte à la main — le dashboard n'est pas branché sur `@otomata/ui` (ADR 0007), et ce
branchement est un lot à part, à décider.

Checklist de fin : (a) aucune valeur magique ; (b) composants réutilisés, pas dupliqués ;
(c) contraste des petits libellés OK (WCAG) ; (d) rendu correct des polices (Spline Sans Mono chargée).
