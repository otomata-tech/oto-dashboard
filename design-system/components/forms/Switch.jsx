import React from "react";

/** Toggle switch. Controlled via `checked` + `onChange`. On = olive. */
export function Switch({ checked = false, onChange, label, disabled, style, ...rest }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, color: "var(--color-ink-soft)", opacity: disabled ? 0.5 : 1, ...style }}>
      <span style={{
        position: "relative", width: 34, height: 20, borderRadius: "var(--radius-pill)", flexShrink: 0,
        background: checked ? "var(--color-olive)" : "var(--color-hair-classic)",
        transition: "background var(--t-fast)",
      }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 16 : 2, width: 16, height: 16,
          borderRadius: "var(--radius-pill)", background: "#fff", boxShadow: "0 1px 2px rgba(44,33,18,.3)",
          transition: "left var(--t-fast) var(--ease-out)",
        }} />
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} {...rest} />
      {label}
    </label>
  );
}
