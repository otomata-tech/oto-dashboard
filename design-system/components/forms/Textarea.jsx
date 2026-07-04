import React from "react";

/**
 * Multiline text input. `mono` for technical text; `doctrine` is the tall
 * mono editor used for agent readmes / procedures (min-height 300, 1.7 line).
 */
export function Textarea({ mono = false, doctrine = false, style, ...rest }) {
  const isMono = mono || doctrine;
  return (
    <textarea
      style={{
        width: "100%", boxSizing: "border-box", border: "1px solid var(--color-hair)", borderRadius: "var(--radius-md)",
        background: "var(--color-surface)", color: "var(--color-ink)",
        padding: doctrine ? "16px 18px" : "9px 11px",
        fontFamily: isMono ? "var(--font-mono)" : "var(--font-sans)",
        fontSize: doctrine ? 12 : 13, lineHeight: doctrine ? 1.7 : 1.5,
        resize: "vertical", minHeight: doctrine ? 300 : 90, outline: "none",
        ...style,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-saffron)"; rest.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-hair)"; rest.onBlur?.(e); }}
      {...rest}
    />
  );
}
