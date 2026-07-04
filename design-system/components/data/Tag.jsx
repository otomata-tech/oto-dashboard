import React from "react";

const TONE = {
  neutral: { background: "transparent", borderColor: "var(--color-hair)", color: "var(--color-mute)" },
  olive:   { background: "var(--color-olive-soft)", borderColor: "transparent", color: "var(--color-olive-ink)" },
  saffron: { background: "var(--color-saffron-soft)", borderColor: "transparent", color: "var(--color-saffron-ink)" },
  terra:   { background: "var(--color-terra-soft)", borderColor: "transparent", color: "var(--color-terra-ink)" },
  cobalt:  { background: "var(--color-cobalt-soft)", borderColor: "transparent", color: "var(--color-cobalt-ink)" },
  ink:     { background: "var(--color-ink)", borderColor: "var(--color-ink)", color: "var(--color-bg)" },
};

/**
 * A mono uppercase pill. Semantic tones (olive=success, terra=danger,
 * saffron=warning/partial, cobalt=info, ink=inverted). One meaning = one
 * color — never decorative.
 */
export function Tag({ tone = "neutral", children, style, ...rest }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
        letterSpacing: "0.1em", textTransform: "uppercase",
        padding: "2.5px 8px", borderRadius: "var(--radius-pill)",
        border: "1px solid", whiteSpace: "nowrap",
        ...TONE[tone], ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
