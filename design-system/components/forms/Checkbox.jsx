import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Checkbox with a label. Controlled via `checked` + `onChange`. */
export function Checkbox({ checked = false, onChange, label, disabled, style, ...rest }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 9, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, color: "var(--color-ink-soft)", opacity: disabled ? 0.5 : 1, ...style }}>
      <span style={{
        width: 18, height: 18, borderRadius: "var(--radius-xs)", flexShrink: 0,
        border: checked ? "1px solid var(--color-ink)" : "1px solid var(--color-hair-classic)",
        background: checked ? "var(--color-ink)" : "var(--color-surface)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: "var(--color-bg)", transition: "background var(--t-fast), border-color var(--t-fast)",
      }}>
        {checked ? <Icon name="check" size={12} sw={3} /> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} {...rest} />
      {label}
    </label>
  );
}
