# oto-dashboard — design system (console produit)

Catalogue des patterns de la console (`dashboard.oto.ninja`). But : ajouter des **écrans** (`views/`) cohérents sans réinventer le shell ni les composants.

- **Source de vérité des classes** = `frontend/src/assets/console.css` (importé global par `main.ts`). Ce fichier dit **quand** utiliser quoi ; il ne reduplique pas le CSS.
- **Tokens** : 6 couleurs de base en `@theme` (`src/assets/main.css`) pour les utilitaires Tailwind ; le **set complet** (`--color-surface/-bg/-ink-soft/-hair-soft`, tous les `-soft`/`-ink` d'accents, `--ease-out`) vit dans `console.css`, consommé en `var(--…)`. Palette = même « Manuscrit chaud » que le site (cf. `@otomata/ui/THEME.md`) — **aucune dépendance à `@otomata/ui`** (ADR 0007).
- shadcn-vue (`src/components/ui/`) dispo pour les primitives complexes (dialog, dropdown…), mais le **langage visuel console** = les classes `console.css` ci-dessous, pas le style shadcn par défaut.

## Marketing vs console — deux dialectes d'une même palette

Mêmes tokens, intentions opposées. Ne pas transplanter l'un dans l'autre :

| | Site marketing (`oto-websites/web`) | Console (ce repo) |
|---|---|---|
| Densité | aérée, éditoriale (`py-88`) | dense, fonctionnelle (`--row-py`, `--pad-card`) |
| Titres | `display-l`, `clamp()`, squiggle | `topbar h1` 16px, `card-head .t` 14px |
| Surfaces | hairlines, peu de cards | **cards** `radius:12px` partout |
| Accents | confettis larges (squiggle, soft bg) | stricts : `.tag`, dots, états |
| Radius | pills, 16–18px | 7–12px (plus carré, outillé) |
| Reveal | scroll-reveal | `.fadein` à l'entrée de vue |

## Shell (ne pas recréer)

`.shell` = grille `sidebar 232px | 1fr`, pleine hauteur. Fourni par le layout console : sidebar (`.sb` : brand + groupes nav + foot user) + `.main` (`.topbar` + `.content`). Une nouvelle page = une **vue** rendue dans `.content`, jamais un nouveau shell.

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

| Classe | Usage |
|---|---|
| `.btn` | action primaire (encre pleine, hover `-1px`) |
| `.btn.ghost` | secondaire (bordée) |
| `.btn-mini` | action de carte/ligne (surface + hairline, radius 7px) |
| `.btn-mini.danger` | destructif (terra) |
| `.linklike` | action inline texte (saffron-ink) |
| `.seg` + `button.on` | segmented control (toggle de vue/mode) |

## Inputs

`.inp` (bordé radius 8px, `.inp.mono` pour valeurs techniques) · `.copyfield` (champ + code copiable, fond `hair-soft`) · `.kbd` (touche). Textarea doctrine : `.doc-editor` (mono, min-height 380px).

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

- `.o-medallion` (`-sm/-md/-lg`) : pastille saffron « o » — logo sidebar, avatars.
- `.squiggle` (+ svg) : souligné ondulé saffron sur **un** mot d'un titre d'état/empty — parcimonie, c'est le clin d'œil au site, pas un ornement de routine.
- `.fadein` : à poser sur la racine de vue pour l'entrée (220ms).

## Checklist nouvel écran

1. Vue dans `src/views/`, route + entrée `consoleNav.ts` (label + groupe).
2. Données via `src/api.ts` (fetch authentifié `/api/*`, JWT Logto) — le front ne détient aucun secret, pas de BFF.
3. Layout : `content-inner` (ou `.narrow` pour un formulaire), cards + grilles `console.css`.
4. Rendre **empty / error / loading** explicitement.
5. Accents = sens (tag/dot/quota), jamais décoratif. Radius outillé (7–12px).
6. Pas de fichier > 500 lignes ; extraire en `components/console/` si besoin.
7. CORS : domaine déjà whitelisté côté oto-backend (`OTO_MCP_CORS_ORIGINS`).
