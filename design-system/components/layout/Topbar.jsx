import React from "react";
import { OtoMark } from "../brand/OtoMark.jsx";
import { IconButton } from "../core/IconButton.jsx";
import { Icon } from "../core/Icon.jsx";

/**
 * The main topbar — Oto mark + page title + mono crumb + right-aligned
 * actions. `onMenu` shows a hamburger (mobile drawer trigger).
 */
export function Topbar({ title, crumb, actions, mark = true, onMenu, style, ...rest }) {
  return (
    <header
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "0 24px", height: 60,
        flexShrink: 0, borderBottom: "1px solid var(--color-hair)", background: "var(--color-bg)", ...style,
      }}
      {...rest}
    >
      {onMenu ? <IconButton icon="menu" label="menu" onClick={onMenu} style={{ marginLeft: -6 }} /> : null}
      {mark ? <span style={{ display: "inline-flex", marginRight: 2 }}><OtoMark variant="mono" size={26} /></span> : null}
      <div style={{ display: "flex", alignItems: "baseline", gap: 11, minWidth: 0 }}>
        {title ? <h1 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "var(--color-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1> : null}
        {crumb ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-faint)", whiteSpace: "nowrap" }}>{crumb}</span> : null}
      </div>
      {actions ? <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>{actions}</div> : null}
    </header>
  );
}

/** Topbar org identity pill — which org the agent acts under. */
export function OrgPill({ name = "Otomata", icon = "building-2", style, ...rest }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px",
        border: "1px solid var(--color-hair)", borderRadius: "var(--radius-pill)",
        fontSize: 12, color: "var(--color-ink-soft)", background: "var(--color-surface)", ...style,
      }}
      {...rest}
    >
      <span style={{ display: "inline-flex", color: "var(--color-mute)" }}><Icon name={icon} size={13} /></span>
      {name}
    </span>
  );
}
