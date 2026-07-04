# oto-dashboard — design system (console produit)

Catalogue des patterns de la console (`dashboard.oto.ninja`). But : ajouter des **écrans** (`views/`) cohérents sans réinventer le shell ni les composants.

> **Direction artistique « 2a » (contraste chaud).** Sidebar **encre** ancrant un contenu crème, cartes qui flottent sur un **filet doux + ombre chaude** (jamais de bord noir), rayons **8px ou pill uniquement**, boutons **tous pill + casse normale**, typo Familjen Grotesk + **Spline Sans Mono**, icônes **Lucide**, logo **« O ouvert »**. Le *pourquoi* et l'inventaire complet : `design-system/DESIGN-BRIEF.md` + `design-system/readme.md` (DS livré par JB). Skill front : `.claude/skills/oto-frontend`. **En cas de conflit repo ↔ brief, le brief gagne.**

- **Source de vérité des classes** = `frontend/src/assets/console.css` (importé global par `main.ts`). Ce fichier dit **quand** utiliser quoi ; il ne reduplique pas le CSS.
- **Tokens** : 6 couleurs de base en `@theme` (`src/assets/main.css`) pour les utilitaires Tailwind ; le **set complet** vit dans `console.css` (`:root`), consommé en `var(--…)`, aligné sur `design-system/tokens/*.css`. Familles clés : neutres crème/encre (`--color-bg/-surface/-ink/-ink-soft/-mute/-faint`, **assombris pour la lisibilité WCAG**) + filet carte `--color-card-bd` ; 4 accents (`saffron/terra/olive/cobalt`, chacun base/`-soft`/`-ink`) ; **surface sidebar encre** (`--sidebar-bg/-fg/-fg-strong/-fg-mute/-hair/-active-bg/-active-fg/-hover-bg`) ; **rayons** `--radius-md` (8px) et `--radius-pill` (999px) — **rien d'autre** ; **élévation** `--shadow-card`/`-pop`/`-drawer` ; motion `--t-fast`/`--ease-out`. Palette = « Manuscrit chaud » — **aucune dépendance à `@otomata/ui`** (ADR 0007).
- **Zéro valeur magique** : couleurs, rayons, espacements, ombres, polices → uniquement via `var(--…)`. **Réutiliser avant d'écrire** : composer les classes/composants existants ; un besoin récurrent (≥2×) manquant → créer un composant dans le système, pas un one-off dans une vue.
- shadcn-vue (`src/components/ui/`) dispo pour les primitives complexes (dialog, dropdown…), mais le **langage visuel console** = les classes `console.css` ci-dessous, pas le style shadcn par défaut.

## Marketing vs console — deux dialectes d'une même palette

Mêmes tokens, intentions opposées. Ne pas transplanter l'un dans l'autre :

| | Site marketing (`oto-websites/web`) | Console (ce repo) |
|---|---|---|
| Densité | aérée, éditoriale (`py-88`) | dense, fonctionnelle (`--row-py`, `--pad-card`) |
| Titres | `display-l`, `clamp()`, squiggle | `topbar h1` 16px, `card-head .t` 14px |
| Surfaces | hairlines, peu de cards | **cards** blanches, filet doux (`--color-card-bd`) + `--shadow-card` |
| Accents | confettis larges (squiggle, soft bg) | stricts : `.tag`, dots, états |
| Radius | pills, 16–18px | **8px (conteneurs) ou pill (boutons/tags/dots)** — rien d'autre |
| Nav | topbar claire | **sidebar encre**, item actif aplat saffron |
| Reveal | scroll-reveal | `.fadein` à l'entrée de vue |

## Shell (ne pas recréer)

`.shell` = grille `sidebar 232px | 1fr`, pleine hauteur. Fourni par le layout console : sidebar **encre** (`.sb` : fond `--sidebar-bg`, textes crème `--sidebar-fg*`, item actif = aplat saffron `.sb-item.on`) portant brand + groupes nav + foot user, et `.main` (`.topbar` + `.content`) sur crème clair. Une nouvelle page = une **vue** rendue dans `.content`, jamais un nouveau shell.

```html
<div class="content-inner">       <!-- gauche-ancré, max 1440px, gap 16px -->
  …cards…
</div>
<!-- formulaire / carte unique : -->
<div class="content-inner narrow">…</div>   <!-- max 680px -->
```

- **Topbar** : `crumb` (mono uppercase) + `h1` (16px, **pas** lowercase ici) + `.right` (org-pill, actions).
- **Nav** : groupes dans `consoleNav.ts` (`sb-group-label` mono + `sb-item`, état actif `.on`). Ajouter un écran = une entrée nav + sa route.
- **Responsive** : sous 820px la sidebar devient un tiroir off-canvas (`useNav`, hamburger `.nav-toggle`), grilles → 1 colonne. Déjà géré, ne rien ajouter.

## Carte — l'unité de base

```html
<div class="card">
  <div class="card-head">
    <div>
      <div class="t">titre</div>
      <div class="s">sous-titre / aide</div>
    </div>
    <div class="actions"><button class="btn-mini">…</button></div>
  </div>
  …contenu…
</div>
```

- `.card.flush` : padding 0 + `overflow:hidden` pour une carte dont le corps est **UNE** surface full-bleed — une `table.tbl` ou une `.rowlist`/liste d'items pleine largeur (le head reprend son padding). **Règle** : seuls une table/rowlist (et le `#actions` slot, qui est dans le head) vont en enfant direct d'une carte `flush`. **Tout autre contenu** (controls, boutons, prose, form, sous-composant) doit être enveloppé dans **`.card-body`** (`console.css` : `padding: 0 var(--pad-card) var(--pad-card)`), sinon il **colle aux bords** (footgun récurrent — `.rowitem` n'a que du padding vertical, idem). ⚠️ Ne PAS padder à la main un enfant de carte flush (fragile, ré-introduit le footgun) : utiliser `.card-body`. Une carte purement controls/recherche/un seul bloc = **carte normale** (sans `flush`). Listes type `.ns-item`/`.ws-item` (hover/active pleine largeur) = `flush` OK avec `padding-inline: var(--pad-card)` sur les items.
- Densité réglée par tokens (`--pad-card`, `--fs-body`) ; `.console-root.density-dense` resserre tout (option utilisateur).

## Grilles

`.grid2` (1fr 1fr) · `.grid23` (2fr 1fr) · `.grid32` (1fr 2fr) — paliers de collapse en mobile.
`.grid3` / `.grid4` — **fluides** (`auto-fit minmax`), reflow seul, pas de media-query à écrire.

## Stats (KPI)

```html
<div class="grid4">
  <div class="stat">
    <div class="l">label mono</div>
    <div class="v">128<span class="unit">appels</span></div>
    <div class="sub">aide</div>
  </div>
</div>
```

Sparkline optionnelle : `.stat .v.with-spark` + `.spark`.

## Tables & listes

- **Table** : `table.tbl` (th mono uppercase `--color-faint`, td `--color-ink-soft`, hover ligne, `.mono`/`.num`/`.dim` pour les cellules). Pour pleine largeur : l'envelopper dans `.card.flush`.
- **Liste de lignes** légère : `.rowlist` + `.rowitem` (flex, hairline-soft entre items, dernier sans filet).

## Tags, pills, dots

`.tag` = pill mono uppercase. Variantes sémantiques (fond `-soft`, sans bordure) : `.tag.olive` (succès), `.tag.terra` (alerte/danger), `.tag.saffron` (warning/partial), `.tag.cobalt` (info), `.tag.ink` (inversé). **Un sens = une couleur**, jamais décoratif.

## Boutons

**Tous les boutons sont en pill (`--radius-pill`) et en casse normale** (« Se connecter », pas « se connecter »). Le seul « bouton-like » non-pill = les jetons d'un `.seg` (segmented), qui restent lowercase.

| Classe | Usage |
|---|---|
| `.btn` | action primaire (encre pleine, hover `-1px`) |
| `.btn.ghost` | secondaire (bordée) |
| `.btn-mini` | action de carte/ligne (surface + hairline, pill) |
| `.btn-mini.danger` | destructif (terra) |
| `.linklike` | action inline texte (saffron-ink) |
| `.seg` + `button.on` | segmented control (jetons 8px, lowercase) |

## Inputs

`.inp` (bordé `--radius-md`, `.inp.mono` pour valeurs techniques) · `.copyfield` (champ + code copiable, surface sunken) · `.kbd` (touche). Textarea doctrine : `.doc-editor` (mono, min-height 380px). Tous les conteneurs de champ = `--radius-md` (8px) ; focus = bord saffron (`--focus-ring`).

## Barres & viz

- `.quota` (track + fill) : `.warn` → saffron, `.over` → terra. Solde/usage.
- `.daybars` : histogramme d'activité (`.seg-ok` empilé, `.seg-err` terra).

## Process & feedback

- `.checkstep` (`.done`) : étapes d'onboarding/checklist (pastille `.ck`, titre barré si fait).
- `.toast` : confirmation transitoire (encre, bas centré, `toast-in`).
- `.divider-dotted`, `.helptext`, `.eyebrow` : ponctuation de section.

## États : empty / error / loading

**Toute vue qui peut être vide, échouer ou charger doit rendre ces trois états** (pas de fallback silencieux — ADR / convention repo).

- **Empty** : `.state-empty` (titre `.se-title` + corps `.se-body` + `.se-cta`) — éditorial, centré.
- **Error** : `.state-error` (`.se-card` bordé terra-soft, `.se-head .t` terra-ink, `.se-msg`, `.se-cta` retry).
- **Loading** : skeletons `.sk` / `.sk-card` (pulse `oto-pulse`), pas de spinner nu.

## Brand & touches éditoriales

- **Logo « O ouvert »** : la marque = un anneau à ouverture haut-droite (bouts ronds en écho aux pills), mono saffron. `.o-medallion` (`-sm/-md/-lg`) le rend en background pour un logo/avatar statique ; la **marque vivante** (états breathe/think/talk) = `<OtoMark>` (`lib/mark.ts`), utilisée topbar + chargements.
- **Icônes = Lucide** (`components/console/Icon.vue`, API `name`, stroke 1.75, `currentColor`) — jamais de SVG dessiné à la main, jamais d'emoji. Le statut passe par `Dot`/`Tag`, pas une icône.
- `.squiggle` (+ svg) : souligné ondulé saffron sur **un** mot d'un titre d'état/empty — parcimonie, c'est le clin d'œil au site, pas un ornement de routine.
- `.fadein` : à poser sur la racine de vue pour l'entrée (220ms).

## Checklist nouvel écran

1. Vue dans `src/views/`, route + entrée `consoleNav.ts` (label + groupe).
2. Données via `src/api.ts` (fetch authentifié `/api/*`, JWT Logto) — le front ne détient aucun secret, pas de BFF.
3. Layout : `content-inner` (ou `.narrow` pour un formulaire), cards + grilles `console.css`.
4. Rendre **empty / error / loading** explicitement.
5. Accents = sens (tag/dot/quota), jamais décoratif. Rayons **8px ou pill** (tokens), zéro valeur en dur. Icônes Lucide.
6. Pas de fichier > 500 lignes ; extraire en `components/console/` si besoin.
7. CORS : domaine déjà whitelisté côté oto-backend (`OTO_MCP_CORS_ORIGINS`).
