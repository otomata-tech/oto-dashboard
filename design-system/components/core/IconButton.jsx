import React from "react";
import { Icon } from "./Icon.jsx";

const SIZES = { sm: 28, md: 32, lg: 38 };

/**
 * A square icon-only button — pill by system rule. `variant`:
 * ghost (transparent, hairline on hover), surface (hairline card), or
 * subtle (no chrome until hover). For toolbar / row / topbar actions.
 */
export function IconButton({ icon, size = "md", variant = "ghost", label, style, ...rest }) {
  const d = typeof size === "number" ? size : SIZES[size];
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: d, height: d, flexShrink: 0, cursor: "pointer",
    borderRadius: "var(--radius-pill)",
    color: "var(--color-ink-soft)",
    transition: "background var(--t-fast), color var(--t-fast), border-color var(--t-fast)",
  };
  const variants = {
    ghost:   { background: "transparent", border: "1px solid transparent" },
    surface: { background: "var(--color-surface)", border: "1px solid var(--color-hair)" },
    subtle:  { background: "transparent", border: "1px solid transparent" },
  };
  return (
    <button
      aria-label={label}
      title={label}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-paper-2)"; e.currentTarget.style.color = "var(--color-ink)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = variant === "surface" ? "var(--color-surface)" : "transparent"; e.currentTarget.style.color = "var(--color-ink-soft)"; }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(d * 0.5)} />
    </button>
  );
}
