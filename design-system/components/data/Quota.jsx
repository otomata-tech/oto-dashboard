import React from "react";

/**
 * A usage/quota bar. Auto-colors: <75% olive, ≥75% saffron (warn), ≥100%
 * terra (over). Shows an optional label and the used/total figure.
 */
export function Quota({ used, total, label = "", style, ...rest }) {
  const pct = Math.min(100, Math.round((used / total) * 100));
  const fill = pct >= 100 ? "var(--color-terra)" : pct >= 75 ? "var(--color-saffron)" : "var(--color-olive)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }} {...rest}>
      <div style={{ height: 5, borderRadius: "var(--radius-pill)", background: "var(--color-hair-soft)", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: "var(--radius-pill)", background: fill, width: pct + "%" }} />
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-mute)", display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span><span>{used} / {total}</span>
      </div>
    </div>
  );
}
