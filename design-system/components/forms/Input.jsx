import React from "react";

/**
 * The console text input — hairline border, 8px radius. `mono` switches to
 * Spline Sans Mono for technical values (keys, ids).
 */
export function Input({ mono = false, style, ...rest }) {
  return (
    <input
      style={{
        width: "100%", boxSizing: "border-box", background: "var(--color-surface)",
        border: "1px solid var(--color-hair)", borderRadius: "var(--radius-md)",
        padding: "7px 11px", color: "var(--color-ink)",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        fontSize: mono ? 12 : 13, outline: "none",
        ...style,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-saffron)"; rest.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-hair)"; rest.onBlur?.(e); }}
      {...rest}
    />
  );
}
