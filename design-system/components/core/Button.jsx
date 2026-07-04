import React from "react";
import { Icon } from "./Icon.jsx";

const KIND_CLASS = {
  primary: "btn",
  accent: "btn",
  ghost: "btn ghost",
  mini: "btn-mini",
  danger: "btn-mini danger",
  link: "linklike",
};

const BASE = {
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
  transition: "transform var(--t-fast) var(--ease-out), background var(--t-fast)",
};

const STYLES = {
  primary: {
    ...BASE, display: "inline-flex", alignItems: "center", gap: 8,
    background: "var(--color-ink)", color: "var(--color-bg)",
    border: "1px solid var(--color-ink)", borderRadius: "var(--radius-pill)",
    padding: "7px 15px", fontSize: 12.5, fontWeight: 600,
  },
  accent: {
    ...BASE, display: "inline-flex", alignItems: "center", gap: 8,
    background: "var(--color-saffron)", color: "var(--color-ink)",
    border: "1px solid var(--color-saffron)", borderRadius: "var(--radius-pill)",
    padding: "7px 15px", fontSize: 12.5, fontWeight: 700,
  },
  ghost: {
    ...BASE, display: "inline-flex", alignItems: "center", gap: 8,
    background: "transparent", color: "var(--color-ink)",
    border: "1px solid var(--color-ink)", borderRadius: "var(--radius-pill)",
    padding: "7px 15px", fontSize: 12.5, fontWeight: 600,
  },
  mini: {
    ...BASE, display: "inline-flex", alignItems: "center", gap: 6,
    background: "var(--color-surface)", color: "var(--color-ink-soft)",
    border: "1px solid var(--color-hair)", borderRadius: "var(--radius-pill)",
    padding: "5px 12px", fontSize: 11.5, fontWeight: 600,
  },
  danger: {
    ...BASE, display: "inline-flex", alignItems: "center", gap: 6,
    background: "var(--color-surface)", color: "var(--color-terra-ink)",
    border: "1px solid var(--color-terra-soft)", borderRadius: "var(--radius-pill)",
    padding: "5px 12px", fontSize: 11.5, fontWeight: 600,
  },
  link: {
    ...BASE, background: "none", border: 0, padding: 0,
    fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--color-saffron-ink)",
  },
};

const HOVER = {
  primary: (e, on) => { e.currentTarget.style.transform = on ? "translateY(-1px)" : "none"; },
  accent: (e, on) => { e.currentTarget.style.transform = on ? "translateY(-1px)" : "none"; },
  ghost: (e, on) => { e.currentTarget.style.background = on ? "var(--color-hair-soft)" : "transparent"; },
  mini: (e, on) => {
    e.currentTarget.style.background = on ? "var(--color-paper-2)" : "var(--color-surface)";
    e.currentTarget.style.color = on ? "var(--color-ink)" : "var(--color-ink-soft)";
  },
  danger: (e, on) => { e.currentTarget.style.background = on ? "var(--color-terra-soft)" : "var(--color-surface)"; },
  link: (e, on) => { e.currentTarget.style.color = on ? "var(--color-ink)" : "var(--color-saffron-ink)"; },
};

/**
 * The console button. `kind` picks the variant; `icon` prepends a glyph.
 * Text is lowercased by design (the console voice). Also renders the
 * `.btn` / `.btn-mini` / `.linklike` classes so global CSS applies too.
 */
export function Button({ kind = "primary", icon, children, className = "", style, disabled, ...rest }) {
  const cls = `${KIND_CLASS[kind] || "btn"} ${className}`.trim();
  return (
    <button
      className={cls}
      disabled={disabled}
      style={{ ...STYLES[kind], ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : null), ...style }}
      onMouseEnter={(e) => !disabled && HOVER[kind]?.(e, true)}
      onMouseLeave={(e) => !disabled && HOVER[kind]?.(e, false)}
      {...rest}
    >
      {icon ? <Icon name={icon} size={kind === "mini" || kind === "danger" || kind === "link" ? 13 : 14} /> : null}
      {children}
    </button>
  );
}
