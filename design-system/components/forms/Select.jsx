import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * Styled select — a popover dropdown (not the native OS menu), consistent with
 * the rest of the system. `options`: string[] or {value,label}[]. Controlled
 * via `value` + `onChange`. For long lists with search, use SearchableSelect.
 */
export function Select({ options = [], value, onChange, placeholder = "Sélectionner…", style, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const sel = opts.find((o) => o.value === value);
  function pick(v) { onChange && onChange(v); setOpen(false); }
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", width: "100%", ...style }} {...rest}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box",
        background: "var(--color-surface)", border: "1px solid var(--color-hair)", borderRadius: "var(--radius-md)",
        padding: "7px 11px", cursor: "pointer", textAlign: "left",
        fontFamily: "var(--font-sans)", fontSize: 13, color: sel ? "var(--color-ink)" : "var(--color-faint)",
      }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel ? sel.label : placeholder}</span>
        <Icon name="chevron-down" size={15} style={{ color: "var(--color-mute)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform var(--t-fast)" }} />
      </button>
      {open ? (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, width: "100%", zIndex: 70, boxSizing: "border-box",
          background: "var(--color-surface)", border: "1px solid var(--border-card)", borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-pop)", padding: 5, maxHeight: 220, overflowY: "auto",
          animation: "oto-pop 140ms var(--ease-out)",
        }}>
          <style>{"@keyframes oto-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}"}</style>
          {opts.map((o) => {
            const on = o.value === value;
            return (
              <button key={o.value} type="button" onClick={() => pick(o.value)}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "var(--color-paper-2)"; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                  padding: "7px 9px", border: 0, borderRadius: "var(--radius-md)", cursor: "pointer",
                  fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--color-ink-soft)",
                  background: on ? "var(--color-paper-2)" : "transparent",
                }}>
                <span style={{ flex: 1 }}>{o.label}</span>
                {on ? <Icon name="check" size={14} style={{ color: "var(--color-saffron-ink)" }} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </span>
  );
}
