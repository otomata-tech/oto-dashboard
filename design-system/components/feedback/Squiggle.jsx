import React from "react";

/**
 * A saffron squiggle underline on a single word — the editorial "wink" from
 * the marketing site. Use once per empty/error title, never as routine
 * decoration. Wrap the word: <Squiggle>quiet</Squiggle>.
 */
export function Squiggle({ children, style, ...rest }) {
  return (
    <span style={{ position: "relative", fontStyle: "italic", fontWeight: 500, whiteSpace: "nowrap", ...style }} {...rest}>
      {children}
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" style={{ position: "absolute", left: 0, bottom: -4, width: "100%", height: 7 }}>
        <path d="M1 5 Q 12 1 24 5 T 48 5 T 72 5 T 99 5" fill="none" stroke="var(--color-saffron)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
