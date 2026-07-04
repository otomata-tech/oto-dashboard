import React from "react";

/**
 * The editorial empty state — centered title (may hold a <Squiggle>), a
 * body paragraph, and a row of CTAs. The console's answer to a blank view;
 * never a silent fallback.
 */
export function StateEmpty({ title, children, cta, style, ...rest }) {
  return (
    <div
      style={{
        maxWidth: 540, margin: "52px auto", textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
        ...style,
      }}
      {...rest}
    >
      <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--color-ink)" }}>{title}</div>
      {children ? <div style={{ fontSize: 13.5, color: "var(--color-mute)", lineHeight: 1.65, maxWidth: 430 }}>{children}</div> : null}
      {cta ? <div style={{ display: "flex", gap: 10, marginTop: 4 }}>{cta}</div> : null}
    </div>
  );
}
