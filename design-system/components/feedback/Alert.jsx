import React from "react";
import { Icon } from "../core/Icon.jsx";
import { IconButton } from "../core/IconButton.jsx";

const TONES = {
  info:    { bg: "var(--color-cobalt-soft)",  fg: "var(--color-cobalt-ink)",  icon: "info" },
  success: { bg: "var(--color-olive-soft)",   fg: "var(--color-olive-ink)",   icon: "circle-check" },
  warning: { bg: "var(--color-saffron-soft)", fg: "var(--color-saffron-ink)", icon: "triangle-alert" },
  danger:  { bg: "var(--color-terra-soft)",   fg: "var(--color-terra-ink)",   icon: "triangle-alert" },
};

/**
 * An inline alert / callout — soft-fill row with a semantic icon, optional
 * title + message, and an optional dismiss. `tone`: info/success/warning/danger.
 */
export function Alert({ tone = "info", title, children, onClose, icon, style, ...rest }) {
  const t = TONES[tone] || TONES.info;
  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 13px",
        background: t.bg, borderRadius: "var(--radius-md)", color: t.fg, ...style,
      }}
      {...rest}
    >
      <span style={{ display: "inline-flex", marginTop: 1, flexShrink: 0 }}><Icon name={icon || t.icon} size={16} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div> : null}
        {children ? <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: title ? 2 : 0, color: "var(--color-ink-soft)", textWrap: "pretty" }}>{children}</div> : null}
      </div>
      {onClose ? <IconButton icon="x" label="fermer" onClick={onClose} size="sm" style={{ margin: "-3px -5px 0 0", color: t.fg }} /> : null}
    </div>
  );
}
