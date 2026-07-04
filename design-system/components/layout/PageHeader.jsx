import React from "react";
import { Dot } from "../data/Dot.jsx";

/**
 * A content page header row — an optional status dot + mono eyebrow on the
 * left, actions (Seg, buttons) on the right. Sits at the top of a Content.
 */
export function PageHeader({ dot, eyebrow, actions, style, ...rest }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, ...style }} {...rest}>
      {dot ? <Dot tone={dot} size={7} /> : null}
      {eyebrow ? (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-mute)" }}>{eyebrow}</span>
      ) : null}
      {actions ? <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>{actions}</div> : null}
    </div>
  );
}
