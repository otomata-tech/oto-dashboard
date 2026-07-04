import React from "react";

const COLORS = {
  olive: "var(--color-olive)",
  terra: "var(--color-terra)",
  saffron: "var(--color-saffron)",
  cobalt: "var(--color-cobalt)",
  faint: "var(--color-hair-classic)",
};

/** A small status dot. Same semantic tones as Tag. */
export function Dot({ tone = "olive", size = 8, style, ...rest }) {
  return (
    <span
      style={{
        display: "inline-block", width: size, height: size,
        borderRadius: "var(--radius-pill)", background: COLORS[tone] || COLORS.olive,
        flexShrink: 0, ...style,
      }}
      {...rest}
    />
  );
}
