import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * A read-only field showing a copyable technical value (endpoint, key).
 * Click the button to copy; the label flips to a check briefly.
 */
export function CopyField({ value, style, ...rest }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    try { navigator.clipboard?.writeText(value); } catch (e) { /* no-op */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        border: "1px solid var(--color-hair)", borderRadius: "var(--radius-md)",
        background: "var(--color-hair-soft)", padding: "7px 8px 7px 12px",
        ...style,
      }}
      {...rest}
    >
      <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{value}</code>
      <button
        onClick={copy}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "var(--color-surface)", color: "var(--color-ink-soft)",
          border: "1px solid var(--color-hair)", borderRadius: "var(--radius-sm)",
          padding: "3px 8px", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
          textTransform: "lowercase", cursor: "pointer", flexShrink: 0,
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={12} />
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
