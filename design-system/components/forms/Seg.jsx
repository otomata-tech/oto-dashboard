import React from "react";

/**
 * Segmented control — a small toggle between 2–3 view/mode options.
 * `options` is [value, label][] or string[]. Controlled via value/onChange.
 */
export function Seg({ options, value, onChange, style, ...rest }) {
  const opts = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  return (
    <div
      style={{
        display: "inline-flex", gap: 2, padding: 2,
        border: "1px solid var(--color-hair)", borderRadius: "var(--radius-md)",
        background: "var(--color-surface)", ...style,
      }}
      {...rest}
    >
      {opts.map(([val, label]) => {
        const on = val === value;
        return (
          <button
            key={val}
            onClick={() => onChange && onChange(val)}
            style={{
              border: 0, borderRadius: "var(--radius-sm)", padding: "4px 11px",
              fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 600,
              textTransform: "lowercase", cursor: "pointer",
              transition: "background var(--t-fast), color var(--t-fast)",
              background: on ? "var(--color-ink)" : "transparent",
              color: on ? "var(--color-bg)" : "var(--color-mute)",
            }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = "var(--color-ink)"; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = "var(--color-mute)"; }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
