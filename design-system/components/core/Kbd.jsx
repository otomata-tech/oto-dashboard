import React from "react";

/** A keyboard key cap. Mono, hairline with a heavier bottom border. */
export function Kbd({ children, style, ...rest }) {
  return (
    <kbd
      style={{
        fontFamily: "var(--font-mono)", fontSize: 10,
        border: "1px solid var(--color-hair)", borderBottomWidth: 2,
        borderRadius: "var(--radius-xs)", padding: "1px 5px",
        color: "var(--color-mute)", background: "var(--color-surface)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </kbd>
  );
}
