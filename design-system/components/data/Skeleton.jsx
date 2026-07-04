import React from "react";

const PULSE = "@keyframes oto-pulse{0%,100%{opacity:1}50%{opacity:.42}}";

/** A loading placeholder block — paper fill, gentle pulse. */
export function Skeleton({ w = "100%", h = 12, radius = "var(--radius-xs)", style, ...rest }) {
  return (
    <div
      style={{ width: w, height: h, borderRadius: radius, background: "var(--color-paper-2)", animation: "oto-pulse 1.1s ease-in-out infinite", ...style }}
      {...rest}
    >
      <style>{PULSE}</style>
    </div>
  );
}

/** A skeleton card — hairline card with a few pulsing lines. */
export function SkeletonCard({ lines = 3, style, ...rest }) {
  return (
    <div style={{ border: "1px solid var(--border-card)", borderRadius: "var(--radius-md)", padding: "15px 17px", background: "var(--color-surface)", ...style }} {...rest}>
      <style>{PULSE}</style>
      <Skeleton w="45%" h={11} />
      <div style={{ height: 12 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ marginTop: i ? 8 : 0 }}><Skeleton w={i === lines - 1 ? "70%" : "100%"} h={9} /></div>
      ))}
    </div>
  );
}
