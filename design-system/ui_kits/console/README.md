# UI kit — Oto Console

Interactive recreation of `dashboard.oto.ninja` in the validated **direction 2a**
(dark ink sidebar, warm soft cards, radii 6/8/pill, Lucide icons). It is composed
**entirely from the design-system components** — it defines no primitives of its own.

## Run it

`index.html` boots a login gate → the console shell. Log in (or open signup), then
use the dark sidebar to move between screens; menus and buttons fire toasts; log out
from the topbar.

## Files

- `kit-auth.jsx` — `Login` + `Signup`, split-panel (dark brand + light form).
- `kit-screens.jsx` — `Overview` (status/activity, KPIs, connector health, MCP
  endpoint, day-bars, next-step), `Connectors` (searchable catalogue `Table` with row
  `Menu`s), `Organization` (members `Table`, roles, shared secrets).
- `kit-app.jsx` — auth gate → `Shell` with `Sidebar` nav + `Topbar`, screen switching,
  toasts.

## How it composes

Everything comes from `window.OtoConsoleDesignSystem_517927` via `_ds_bundle.js`:
`Shell` / `Sidebar` / `SidebarGroup` / `SidebarItem` / `Identity` / `UserMenu` /
`Topbar` / `OrgPill` for the frame; `Card` / `Stat` / `Table` / `Tag` / `Dot` / `Quota`
/ `DayBars` / `CopyField` / `Seg` / `CheckStep` for content; `Field` / `Input` /
`Switch` / `Button` for forms; `Menu` / `IconButton` for row actions. No local CSS —
the dark sidebar and all styling come from the components and tokens.

The content is illustrative (fake orgs, connectors, members) — it mirrors the product's
information architecture, not live data.
