import React from "react";
import { IconButton } from "../core/IconButton.jsx";

const KF = "@keyframes oto-fade{from{opacity:0}to{opacity:1}}@keyframes oto-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}";

/**
 * A modal dialog — dimmed backdrop + centered card (title, body, footer).
 * Controlled via `open`; `onClose` fires on backdrop click or the ✕.
 */
export function Dialog({ open, title, sub, children, footer, onClose, width = 440, style, ...rest }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80, background: "rgba(44,33,18,.34)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        animation: "oto-fade 160ms var(--ease-out)",
      }}
    >
      <style>{KF}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width, maxWidth: "100%", background: "var(--color-surface)",
          border: "1px solid var(--border-card)", borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-pop)", padding: "20px 22px",
          animation: "oto-pop 180ms var(--ease-out)", ...style,
        }}
        {...rest}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: children ? 14 : 0 }}>
          <div style={{ flex: 1 }}>
            {title ? <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div> : null}
            {sub ? <div style={{ fontSize: 12.5, color: "var(--color-mute)", marginTop: 3, lineHeight: 1.5, textWrap: "pretty" }}>{sub}</div> : null}
          </div>
          {onClose ? <IconButton icon="x" label="close" onClick={onClose} style={{ marginTop: -4, marginRight: -6 }} /> : null}
        </div>
        {children}
        {footer ? <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>{footer}</div> : null}
      </div>
    </div>
  );
}
