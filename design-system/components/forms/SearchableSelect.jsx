import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * A searchable select (combobox) — a trigger showing the selected value opens
 * a popover with a search field + filtered options. `options`: string[] or
 * {value,label}[]. Controlled via `value` + `onChange`.
 */
export function SearchableSelect({ options = [], value, onChange, placeholder = "Sélectionner…", searchPlaceholder = "Rechercher…", width = 260, style, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(""); } }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const sel = opts.find((o) => o.value === value);
  const filtered = opts.filter((o) => String(o.label).toLowerCase().includes(q.toLowerCase()));
  function pick(v) { onChange && onChange(v); setOpen(false); setQ(""); }
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", width, ...style }} {...rest}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        background: "var(--color-surface)", border: "1px solid var(--color-hair)",
        borderRadius: "var(--radius-md)", padding: "7px 11px", cursor: "pointer", textAlign: "left",
        fontFamily: "var(--font-sans)", fontSize: 13, color: sel ? "var(--color-ink)" : "var(--color-faint)",
      }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel ? sel.label : placeholder}</span>
        <Icon name="chevron-down" size={15} style={{ color: "var(--color-mute)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform var(--t-fast)" }} />
      </button>
      {open ? (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, width: "100%", zIndex: 70,
          background: "var(--color-surface)", border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-pop)", overflow: "hidden",
          animation: "oto-pop 140ms var(--ease-out)",
        }}>
          <style>{"@keyframes oto-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}"}</style>
          <div style={{ padding: 7, borderBottom: "1px solid var(--color-hair-soft)", position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 16, color: "var(--color-faint)", display: "inline-flex" }}><Icon name="search" size={14} /></span>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} style={{
              width: "100%", border: "1px solid var(--color-hair)", borderRadius: "var(--radius-md)",
              padding: "6px 10px 6px 30px", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--color-ink)", outline: "none",
            }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto", padding: 5 }}>
            {filtered.length ? filtered.map((o) => {
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
            }) : <div style={{ padding: "12px 10px", fontSize: 12.5, color: "var(--color-faint)", textAlign: "center" }}>aucun résultat</div>}
          </div>
        </div>
      ) : null}
    </span>
  );
}
