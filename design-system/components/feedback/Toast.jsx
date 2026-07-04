import React from "react";

/**
 * A transient confirmation toast — ink pill, bottom-center. Render it while
 * `message` is truthy; it animates in. (You control mount/unmount timing.)
 */
export function Toast({ children, style, ...rest }) {
  return (
    <div
      style={{
        position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)",
        background: "var(--color-ink)", color: "var(--color-bg)",
        borderRadius: "var(--radius-pill)", padding: "8px 18px",
        fontSize: 12.5, fontWeight: 600, zIndex: 60,
        animation: "oto-toast-in 180ms var(--ease-out)",
        ...style,
      }}
      {...rest}
    >
      <style>{"@keyframes oto-toast-in{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}"}</style>
      {children}
    </div>
  );
}
