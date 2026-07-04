import React from "react";

/**
 * An onboarding / checklist step. `done` collapses the bullet to an olive
 * check and strikes the title. `n` is the step number shown when not done.
 */
export function CheckStep({ done = false, n, title, children, action, last = false }) {
  return (
    <div style={{ display: "flex", gap: 13, padding: "13px 0", borderBottom: last ? 0 : "1px solid var(--color-hair-soft)", alignItems: "flex-start" }}>
      <span
        style={{
          width: 22, height: 22, borderRadius: "var(--radius-pill)", flexShrink: 0, marginTop: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: 10,
          border: done ? "1.5px solid var(--color-olive)" : "1.5px solid var(--color-hair-classic)",
          background: done ? "var(--color-olive)" : "var(--color-surface)",
          color: done ? "#fff" : "var(--color-mute)",
        }}
      >
        {done ? "✓" : n}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: done ? "var(--color-faint)" : "var(--color-ink)", textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--color-hair-classic)" }}>{title}</div>
        {children ? <div style={{ fontSize: "var(--fs-small)", color: "var(--color-mute)", marginTop: 2, lineHeight: 1.5, textWrap: "pretty" }}>{children}</div> : null}
        {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
      </div>
    </div>
  );
}
