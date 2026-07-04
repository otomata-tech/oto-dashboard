One-line: Outline icon from **Lucide** (the product's configured library), inlined and curated to Oto's set — modern, consistent, `currentColor`.

```jsx
<Icon name="plug" />                 // Lucide name
<Icon name="connectors" size={18} /> // Oto semantic alias → plug
<Icon name="chevron-right" />
```

Accepts Lucide names (`chevron-right`, `key-round`, `book-open`) or Oto aliases (`connectors`, `procedures`, `data`, `agent`). Default `size=16`, stroke `1.75`. Inherits color from the parent — never hardcode a fill. `ICON_NAMES` lists everything available. No emoji, no hand-drawn SVG anywhere in the system.
