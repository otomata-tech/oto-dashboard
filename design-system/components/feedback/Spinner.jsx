import React from "react";

/** A spinning loader — a warm ring with an ink arc. Inline size in px. */
export function Spinner({ size = 18, sw = 2.25, style, ...rest }) {
  return (
    <span style={{ display: "inline-flex", ...style }} {...rest}>
      <style>{"@keyframes oto-spin{to{transform:rotate(360deg)}}"}</style>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: "oto-spin 0.7s linear infinite" }}>
        <circle cx="12" cy="12" r="9" stroke="var(--color-hair)" strokeWidth={sw} />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="var(--color-ink)" strokeWidth={sw} strokeLinecap="round" />
      </svg>
    </span>
  );
}
