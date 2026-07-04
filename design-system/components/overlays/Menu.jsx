import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * A dropdown menu. `trigger` is the clickable element; children are MenuItems.
 * Manages its own open state and closes on outside click / item click.
 */
export function Menu({ trigger, children, align = "left", width = 200, style, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", ...style }} {...rest}>
      <span onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", cursor: "pointer" }}>{trigger}</span>
      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", [align]: 0, width, zIndex: 70,
            background: "var(--color-surface)", border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-pop)", padding: 5,
            animation: "oto-pop 140ms var(--ease-out)",
          }}
        >
          <style>{"@keyframes oto-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}"}</style>
          {children}
        </div>
      ) : null}
    </span>
  );
}

/** A row inside a Menu. `danger` tints terra; `icon` prepends a glyph. */
export function MenuItem({ icon, danger = false, children, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const hoverBg = danger ? "var(--color-terra-soft)" : "var(--color-paper-2)";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
        padding: "7px 9px", border: 0, borderRadius: "var(--radius-xs)", cursor: "pointer",
        fontFamily: "var(--font-sans)", fontSize: 13,
        color: danger ? "var(--color-terra-ink)" : "var(--color-ink-soft)",
        background: hover ? hoverBg : "transparent", transition: "background var(--t-fast)", ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={15} style={{ opacity: 0.85 }} /> : null}
      {children}
    </button>
  );
}
