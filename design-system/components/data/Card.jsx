import React from "react";

/**
 * The base container of the console. A white surface with a hairline border
 * and 12px radius. Optional head (title + sub + actions). `flush` removes
 * body padding for a full-bleed table/rowlist child (wrap other content in
 * a div with padding yourself).
 */
export function Card({ title, sub, actions, flush = false, children, style, ...rest }) {
  const hasHead = title || actions;
  return (
    <section
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--border-card)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-card)",
        padding: flush ? 0 : "var(--pad-card)",
        overflow: flush ? "hidden" : undefined,
        ...style,
      }}
      {...rest}
    >
      {hasHead ? (
        <div
          style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            marginBottom: flush ? 0 : 12,
            padding: flush ? "var(--pad-card) var(--pad-card) 12px" : undefined,
          }}
        >
          <div>
            {title ? <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div> : null}
            {sub ? <div style={{ fontSize: "var(--fs-small)", color: "var(--color-mute)", marginTop: 2, lineHeight: 1.45, textWrap: "pretty" }}>{sub}</div> : null}
          </div>
          {actions ? <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
