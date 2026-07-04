import React from "react";

/**
 * A horizontal divider. Plain hairline, or with a centered mono label
 * (e.g. "ou") when `label` is set.
 */
export function Divider({ label, style, ...rest }) {
  if (!label) {
    return <hr style={{ border: 0, borderTop: "1px solid var(--color-hair)", margin: "4px 0", ...style }} {...rest} />;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }} {...rest}>
      <span style={{ flex: 1, height: 1, background: "var(--color-hair)" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-faint)" }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--color-hair)" }} />
    </div>
  );
}
