import React from "react";

/**
 * The dark ink sidebar — the high-contrast anchor of the console. Holds a
 * `brand` block (top), nav groups (children, scroll), and a `foot` (user).
 */
export function Sidebar({ brand, foot, children, style, ...rest }) {
  return (
    <aside
      style={{
        display: "flex", flexDirection: "column", minHeight: 0,
        background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-hair)", ...style,
      }}
      {...rest}
    >
      {brand ? (
        <div style={{ padding: "14px 14px", borderBottom: "1px solid var(--sidebar-hair)" }}>{brand}</div>
      ) : null}
      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 12px", display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
        {children}
      </nav>
      {foot ? (
        <div style={{ borderTop: "1px solid var(--sidebar-hair)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>{foot}</div>
      ) : null}
    </aside>
  );
}

/** A labelled group of sidebar items (mono uppercase label). */
export function SidebarGroup({ label, children, style, ...rest }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, ...style }} {...rest}>
      {label ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--sidebar-fg-mute)", padding: "2px 8px 5px" }}>{label}</div>
      ) : null}
      {children}
    </div>
  );
}
