import React from "react";

/**
 * Form field wrapper — mono label on top, control (children) in the middle,
 * and a hint or error line below. Error (terra) supersedes hint.
 */
export function Field({ label, hint, error, htmlFor, children, style, ...rest }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }} {...rest}>
      {label ? (
        <label htmlFor={htmlFor} style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-mute)" }}>{label}</label>
      ) : null}
      {children}
      {error ? (
        <span style={{ fontSize: 11.5, color: "var(--color-terra-ink)", lineHeight: 1.5 }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 11.5, color: "var(--color-mute)", lineHeight: 1.5, textWrap: "pretty" }}>{hint}</span>
      ) : null}
    </div>
  );
}
