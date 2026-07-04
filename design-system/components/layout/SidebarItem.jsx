import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * A sidebar nav item (dark). `active` fills solid saffron; `count` shows a
 * mono figure at the right. Renders as a button — wire `onClick` to navigate.
 */
export function SidebarItem({ icon, active = false, count, children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const bg = active ? "var(--sidebar-active-bg)" : hover ? "var(--sidebar-hover-bg)" : "transparent";
  const fg = active ? "var(--sidebar-active-fg)" : "var(--sidebar-fg)";
  const icColor = active ? "var(--sidebar-active-fg)" : "var(--sidebar-fg-mute)";
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
        padding: "8px 10px", border: 0, borderRadius: "var(--radius-md)", cursor: "pointer",
        fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: active ? 700 : 500,
        color: fg, background: bg, transition: "background var(--t-fast), color var(--t-fast)", ...style,
      }}
      {...rest}
    >
      {icon ? <span style={{ display: "inline-flex", color: icColor }}><Icon name={icon} size={16} /></span> : null}
      {children}
      {count ? <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: icColor }}>{count}</span> : null}
    </button>
  );
}
