import React from "react";

const TONE = {
  neutral: { background: "var(--color-paper-2)", color: "var(--color-ink-soft)" },
  olive:   { background: "var(--color-olive-soft)", color: "var(--color-olive-ink)" },
  saffron: { background: "var(--color-saffron-soft)", color: "var(--color-saffron-ink)" },
  terra:   { background: "var(--color-terra-soft)", color: "var(--color-terra-ink)" },
  cobalt:  { background: "var(--color-cobalt-soft)", color: "var(--color-cobalt-ink)" },
  ink:     { background: "var(--color-ink)", color: "var(--color-bg)" },
};

/**
 * A small count / status badge — a compact mono pill for numbers or short
 * labels (nav counts, notification totals). Smaller than Tag.
 */
export function Badge({ tone = "neutral", children, style, ...rest }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 18, height: 18, padding: "0 6px", borderRadius: "var(--radius-pill)",
        fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, lineHeight: 1,
        ...TONE[tone], ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
