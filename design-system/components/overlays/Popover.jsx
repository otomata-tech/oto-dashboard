import React from "react";

/**
 * A popover — a floating panel anchored under a trigger. Unlike Menu, it does
 * NOT close on inner clicks (so it can hold inputs/forms). Self-manages open
 * state; closes on outside click. Content controls its own padding.
 */
export function Popover({ trigger, children, align = "left", width = 240, panelStyle, style, ...rest }) {
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
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", [align]: 0, width, zIndex: 70,
          background: "var(--color-surface)", border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-pop)",
          animation: "oto-pop 140ms var(--ease-out)", ...panelStyle,
        }}>
          <style>{"@keyframes oto-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}"}</style>
          {children}
        </div>
      ) : null}
    </span>
  );
}
