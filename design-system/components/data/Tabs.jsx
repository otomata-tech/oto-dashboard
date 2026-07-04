import React from "react";

/**
 * Underline tabs — for switching sections within a page (distinct from Seg,
 * which is a compact pill toggle). `tabs`: {key, label}[]. Controlled.
 */
export function Tabs({ tabs, value, onChange, style, ...rest }) {
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--color-hair)", ...style }} {...rest}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            onClick={() => onChange && onChange(t.key)}
            style={{
              border: 0, background: "none", padding: "8px 12px", cursor: "pointer",
              fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: on ? 700 : 500,
              color: on ? "var(--color-ink)" : "var(--color-mute)",
              borderBottom: on ? "2px solid var(--color-ink)" : "2px solid transparent",
              marginBottom: -1, transition: "color var(--t-fast)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
