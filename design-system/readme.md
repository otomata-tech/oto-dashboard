# Oto Console Design System

The design system for **Oto** — Otomata's open-source B2B automation platform, piloted
by AI agents over MCP — and its product console (`dashboard.oto.ninja`, the front-end for
`oto-mcp`). It captures the **"Manuscrit chaud"** (warm manuscript) language, refined into
a high-contrast, modern, artisanal direction: a **dark ink sidebar** anchoring warm cream
content, soft-floating cards, a strict radius scale, Familjen Grotesk + Spline Sans Mono, the
**Lucide** icon set, and four semantic accents used only to carry meaning.

Consumers link one file — `styles.css` — and load `_ds_bundle.js` for the React components.

> The full art-direction rationale and build spec live in **`DESIGN-BRIEF.md`**. Read it
> first to understand *why* the system looks the way it does.

## Sources

Ground truth is the product codebase — read it to go deeper / stay accurate:

- **[otomata-tech/oto-dashboard](https://github.com/otomata-tech/oto-dashboard)** — the Vue 3
  console. Tokens + component classes: `frontend/src/assets/main.css` & `console.css`;
  design doctrine: `DESIGN.md`; screens: `frontend/src/views/console/`; primitives:
  `frontend/src/components/console/`. Brand mark engine: `frontend/src/lib/mark.ts`. The
  icon library is declared in `package.json` (`@lucide/vue`) and `components.json`
  (`iconLibrary: "lucide"`).
- Wider context: `otomata-tech/oto` (platform doctrine), `otomata-tech/oto-backend` (the
  MCP API the console talks to), `otomata-tech/oto-cli`.

## What Oto is

Oto lets people and AI agents run B2B automations — French open data (recherche-entreprises,
Sirene, BODACC), Google Workspace, CRMs, web search — through an **MCP** endpoint. The
console manages what an agent acts through: connectors & API keys, organizations & shared
secrets, projects, procedures/doctrine, and memory. The topbar always shows the **MCP
identity** (account × active org) the agent is acting under.

---

## Content fundamentals

- **Bilingual, French-leaning.** UI chrome and product nouns skew French (`connectors`,
  `procédures`, `données`, `gérer mon org`, `ce que voit ton agent`); technical / onboarding
  copy is often lowercase English (`add your first api key`, `point your client here`). Match
  the surface: nav + governance = French; developer-facing help = English.
- **Case.** Tags, eyebrows, group labels and segmented controls stay lowercase / uppercase-mono;
  **buttons use sentence case** (a deliberate softening — "Se connecter", not "se connecter").
  Page titles (`h1`) are normal case, not Title Case.
- **Voice = tu / direct.** French addresses the user informally (`ton agent`, `crée-en un`);
  English is plain and imperative (`paste a provider key`).
- **Technical, unflashy, quietly witty.** State what a thing does in concrete terms. The one
  indulgence is the **editorial wink**: an empty state reads *"your console is `quiet`."*
  with a saffron squiggle under one word — used sparingly, never routine.
- **Meaning over decoration.** Status words are exact (`live`, `partial`, `re-auth needed`,
  `expiring`) and always paired with a semantic color. No exclamation marks, no hype, **no
  emoji** — the arrow `→` is the standard affordance on links and CTAs.

## Visual foundations (direction 2a)

- **High contrast via a dark sidebar.** The sidebar is **ink** (`#2c2112`) with cream text;
  content is warm cream (`#fefcf5`) with white cards. This dark/light split is the identity
  gesture and the readability engine. Active nav items fill **solid saffron**.
- **Warm cards, never a black border.** A card is a white surface with a **soft warm hairline**
  (`--border-card` `#ede1bd`) and a **soft warm shadow** (`--shadow-card`) that floats it off
  the cream — separation without heavy outlines.
- **Color.** Cream/ink neutrals; four confetti accents, each with a `-soft` fill + `-ink` text:
  **saffron** `#f0b41e` (brand / warning-partial / focus / active), **terra** `#d63d0a`
  (danger), **olive** `#8aa620` (success), **cobalt** `#1f6dba` (info/personal). Accents are
  strict — one meaning per color, never decorative.
- **Type.** *Familjen Grotesk* carries all reading + UI; *Spline Sans Mono* is the technical
  voice (eyebrows, group labels, table headers, counts, codes — uppercase, tracked 0.14–0.18em).
  Titles are tight (−0.01 to −0.03em, 700); body is small and dense (13.5px). Italic Familjen
  is the signature (medallion "o", the squiggle wink).
- **Radii — strict two-tier, never in between:** **8px** (every container — inputs, cards,
  stats, menus, dialogs, wells, kbd, chips, segmented) · **pill / 999px** (ALL buttons —
  primary, accent, ghost, mini, oauth — plus tags, dots, avatars, org-pill). One container
  radius keeps every surface homogeneous next to the pills.
- **Elevation.** Minimal and warm: `--shadow-card` floats resting cards; `--shadow-pop` lifts
  menus/dialogs. No inner shadows, no glow.
- **Backgrounds.** Flat cream — no photography, no textures, no decorative gradients (the only
  gradients live inside the brand mark's four radial quadrants).
- **Motion.** Quick, eased-out: `--t-fast 180ms` + `cubic-bezier(.22,1,.36,1)`. Views fade-and-
  rise in (220ms). Toasts slide up. The mark has opt-in living states. Respects
  `prefers-reduced-motion`; no bounces, no infinite decorative loops on content.
- **Hover / press.** Primary/accent buttons lift −1px; ghost fills soft; mini buttons and
  sidebar/table rows warm to `paper-2`; nav hover is a faint white wash on ink. Inputs take a
  saffron focus border. Restrained — color/position shifts, not scale-pops.
- **Layout.** Fixed 232px sidebar + fluid content, full height. Content is **left-anchored**,
  capped 1440px (680 narrow for forms).

## Iconography — Lucide

- **Lucide** is the product's configured library (`@lucide/vue`, `components.json`). The
  hand-drawn set of the first draft is retired. The `Icon` component **inlines** a curated set
  of ~36 Lucide glyphs (verbatim path data, ISC-licensed) — self-contained, no CDN, exact.
- Stroke **1.75**, 24-grid, `currentColor`, round caps/joins. `<Icon name="connectors" />`
  accepts Lucide names or Oto semantic aliases. Never hand-draw an SVG or use emoji.
- Status is carried by `Dot` / `Tag`, not icons: a colored dot or a soft-fill mono pill.
- Assets in `assets/`: `favicon.svg` (four-color quadrant disc), `favicon-32x32.png`,
  `oto-mark-512.png`, `apple-touch-icon.png`. The living mark is `OtoMark`.

## Components

React primitives, grouped by concern under `components/`. Import from the bundle namespace
`window.OtoConsoleDesignSystem_517927` after loading `_ds_bundle.js`.

- **brand/** — `OtoMark` (living pierced-disc mark), `Medallion` (the pierced-disc "o", not a
  typographic letter), `Avatar`.
- **core/** — `Button` (primary · accent · ghost · mini · danger · link — all pill),
  `IconButton`, `Icon` (Lucide set), `Kbd`.
- **layout/** — `Shell`, `Content`, `Sidebar`, `SidebarGroup`, `SidebarItem`, `Identity`,
  `UserMenu`, `Topbar`, `OrgPill`, `PageHeader`.
- **forms/** — `Input`, `Textarea`, `Select`, `SearchableSelect`, `Checkbox`, `Radio`, `Switch`,
  `Field`, `Seg`, `CopyField`, `Dropzone`.
- **overlays/** — `Dialog`, `Menu`, `MenuItem`, `Popover`, `Tooltip`.
- **navigation/** — `Breadcrumb`, `Pagination`.
- **data/** — `Card`, `Stat`, `Quota`, `Tag`, `Dot`, `Badge`, `Divider`, `Table`, `Tabs`,
  `DayBars`, `Accordion`, `Skeleton`, `SkeletonCard`.
- **feedback/** — `Alert`, `Spinner`, `CheckStep`, `StateEmpty`, `StateError`, `Squiggle`, `Toast`.

Each component directory carries a `@dsCard` HTML specimen (Design System tab) and each
component has a `.d.ts` contract + (for most) a `.prompt.md` usage note.

### Intentional additions

Beyond the console's own `components/console/` inventory, these ergonomic wrappers were added:
`IconButton` (pill icon-only button, for topbar/row actions), `Field` (label + hint + error
wrapper), and layout composers (`Shell`/`Content`/`PageHeader`) so any page is 3 lines. `Icon`
and `OtoMark` are faithful ports of the product's own Lucide set and mark engine, not inventions.

## UI kits

- **ui_kits/console/** — interactive recreation of the Oto Console in direction 2a: **login /
  signup** (split dark-brand + form), **overview** (status/activity, KPIs, connector health,
  MCP endpoint, day-bars, next-step), **connectors** (searchable catalogue table + row menus),
  **organization** (members table, roles, shared secrets). Composed entirely from the
  components above. See its `README.md`.

## Foundations (Design System tab)

Specimen cards in `guidelines/`: neutrals, accents, accent-tags, **dark sidebar surface**
(Colors); Familjen & Spline Sans Mono (Type); **radii 8/pill**, **elevation**, density
(Spacing); logo/favicon, **Lucide iconography** (Brand). Component groups render their own cards.

## Index / manifest

- `styles.css` — entry point (imports only). Consumers link this.
- `DESIGN-BRIEF.md` — the art-direction + build brief (read first).
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`.
- `components/` — `brand/`, `core/`, `layout/`, `forms/`, `overlays/`, `data/`, `feedback/`
  (each: `.jsx` + `.d.ts` + `.prompt.md` + one `*.card.html`).
- `guidelines/` — foundation specimen cards.
- `ui_kits/console/` — the product recreation.
- `assets/` — brand marks (favicon SVG/PNG, app icons).
- `SKILL.md` — Agent-Skill wrapper for Claude Code.
- `_ds_bundle.js`, `_ds_manifest.json` — generated; do not edit.

## Substitutions & caveats

- Webfonts (Familjen Grotesk, Spline Sans Mono, Inter) load from **Google Fonts** — the same
  source the product uses — so no font binaries are vendored. Ask if you want them self-hosted.
- The Lucide glyph set is **curated** (~36 icons Oto uses). Need more? Add the glyph's path
  data to `components/core/Icon.jsx` from the Lucide source.
- The console's heaviest widgets (column-filtered data-table, connector drawer, Unovis charts)
  are represented by their patterns (`Table`, `Card`, `DayBars`), not reproduced 1:1. Ask if
  you need a specific one built out.
