---
name: oto-design
description: Use this skill to generate well-branded interfaces and assets for Oto (Otomata's B2B automation platform and its console dashboard.oto.ninja), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping the "Manuscrit chaud" (warm manuscript) visual language.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files
(`styles.css` + `tokens/` for the foundations, `components/` for the React primitives and
their `.prompt.md` usage notes, `guidelines/` for specimen cards, `ui_kits/console/` for a
full product recreation, `assets/` for brand marks).

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and
create static HTML files for the user to view — link `styles.css` for tokens, and either load
`_ds_bundle.js` for the React components or lift the inline styles from the component sources.
If working on production code, copy assets and read the rules here to become an expert in
designing with this brand.

Core rules to honor (see `readme.md` and `DESIGN-BRIEF.md` for the full guide): warm cream +
ink base with a **dark ink sidebar** for high contrast; four strict semantic accents (saffron /
terra / olive / cobalt — one meaning per color, never decorative); Familjen Grotesk for reading
+ Spline Sans Mono (uppercase, tracked) for the technical voice; lowercase labels; French chrome
+ English developer copy; white cards on a soft warm hairline + subtle shadow (never a black
border); **strict radii — 8px or pill, nothing in between** (all buttons are pill); quick
eased-out motion; **Lucide** icons via the `Icon` component and the `OtoMark` — never hand-drawn
SVG or emoji.

If the user invokes this skill without any other guidance, ask them what they want to build or
design, ask a few clarifying questions, and act as an expert designer who outputs HTML
artifacts _or_ production code, depending on the need.
