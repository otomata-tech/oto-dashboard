import React from "react";

/**
 * The console shell — a full-height grid of sidebar (232px) + main column.
 * Pass the <Sidebar> as `sidebar`; the main column holds the Topbar + content.
 */
export function Shell({ sidebar, children, style, ...rest }) {
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "var(--sb-w) 1fr",
        height: "100vh", background: "var(--color-bg)",
        fontFamily: "var(--font-sans)", color: "var(--color-ink)", ...style,
      }}
      {...rest}
    >
      {sidebar}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Scrolling content region under the topbar. Left-anchored, capped width;
 * `narrow` for single-column forms. Children stack with a 16px gap.
 */
export function Content({ narrow = false, children, style, ...rest }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 26px 64px", minHeight: 0 }}>
      <div
        style={{
          width: "100%", maxWidth: narrow ? "var(--content-narrow)" : "var(--content-max)",
          margin: 0, display: "flex", flexDirection: "column", gap: "var(--gap-stack)", ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
}
