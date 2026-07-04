import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * Accordion — a card of collapsible rows. `items`: {title, content}[].
 * `defaultOpen` is the initially expanded index (-1 for none).
 */
export function Accordion({ items, defaultOpen = 0, style, ...rest }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{ border: "1px solid var(--border-card)", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--color-surface)", boxShadow: "var(--shadow-card)", ...style }} {...rest}>
      {items.map((it, i) => {
        const on = open === i;
        return (
          <div key={i} style={{ borderTop: i ? "1px solid var(--color-hair-soft)" : 0 }}>
            <button onClick={() => setOpen(on ? -1 : i)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 15px",
              border: 0, background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)",
              fontSize: 13.5, fontWeight: 600, color: "var(--color-ink)", textAlign: "left",
            }}>
              <span style={{ flex: 1 }}>{it.title}</span>
              <Icon name="chevron-down" size={16} style={{ color: "var(--color-mute)", transform: on ? "rotate(180deg)" : "none", transition: "transform var(--t-fast)" }} />
            </button>
            {on ? <div style={{ padding: "0 15px 14px", fontSize: 12.5, lineHeight: 1.6, color: "var(--color-ink-soft)", textWrap: "pretty" }}>{it.content}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
