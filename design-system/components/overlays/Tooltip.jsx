import React from "react";

/**
 * A hover tooltip — a small ink bubble above the child. Wrap any element.
 */
export function Tooltip({ label, children, style, ...rest }) {
  const [show, setShow] = React.useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", ...style }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      {...rest}
    >
      {children}
      {show ? (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 11, fontWeight: 500,
          padding: "4px 8px", borderRadius: "var(--radius-xs)", whiteSpace: "nowrap",
          zIndex: 90, pointerEvents: "none", boxShadow: "var(--shadow-pop)",
        }}>{label}</span>
      ) : null}
    </span>
  );
}
