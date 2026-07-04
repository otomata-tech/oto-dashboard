import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Button } from "../core/Button.jsx";

/**
 * The error state — a terra-bordered card with a clear message and a retry.
 * Every view that can fail renders this instead of a silent fallback.
 */
export function StateError({ title = "quelque chose a échoué", message, onRetry, style, ...rest }) {
  return (
    <div style={{ maxWidth: 560, margin: "48px auto", ...style }} {...rest}>
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-terra-soft)", borderRadius: "var(--radius-md)", padding: 22, boxShadow: "var(--shadow-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="triangle-alert" size={18} style={{ color: "var(--color-terra)" }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--color-terra-ink)" }}>{title}</span>
        </div>
        {message ? <div style={{ fontSize: 13, color: "var(--color-ink-soft)", lineHeight: 1.6, marginTop: 8, textWrap: "pretty" }}>{message}</div> : null}
        {onRetry ? <div style={{ marginTop: 16 }}><Button kind="mini" icon="refresh-cw" onClick={onRetry}>réessayer</Button></div> : null}
      </div>
    </div>
  );
}
