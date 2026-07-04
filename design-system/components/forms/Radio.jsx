import React from "react";

/**
 * Radio + label — classic style: a hairline ring that gains a perfectly
 * centered ink dot when selected. Controlled via `checked` + `onChange`
 * (group radios by `name`).
 */
export function Radio({ checked = false, onChange, label, name, value, disabled, style, ...rest }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 9, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, color: "var(--color-ink-soft)", opacity: disabled ? 0.5 : 1, ...style }}>
      <span style={{
        position: "relative", width: 18, height: 18, borderRadius: "var(--radius-pill)", flexShrink: 0,
        border: `1.5px solid ${checked ? "var(--color-ink)" : "var(--color-hair-classic)"}`,
        background: "var(--color-surface)", transition: "border-color var(--t-fast)",
      }}>
        {checked ? (
          <span style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: 8, height: 8, borderRadius: "var(--radius-pill)", background: "var(--color-ink)",
          }} />
        ) : null}
      </span>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} {...rest} />
      {label}
    </label>
  );
}
