import React from "react";

/**
 * An activity histogram — one bar per period, olive/hair stack with terra
 * failures on top. `data`: [ok, err][]. Hover a bar to warm it saffron.
 */
export function DayBars({ data, height = 84, style, ...rest }) {
  const max = Math.max(1, ...data.map(([o, e]) => o + e));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, ...style }} {...rest}>
      {data.map(([ok, err], i) => <Bar key={i} ok={ok} err={err} max={max} />)}
    </div>
  );
}

function Bar({ ok, err, max }) {
  const [h, setH] = React.useState(false);
  return (
    <div
      title={`${ok} ok · ${err} err`}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1, height: "100%" }}
    >
      {err > 0 ? <div style={{ height: `${(err / max) * 100}%`, background: "var(--color-terra)", borderRadius: 2 }} /> : null}
      <div style={{
        height: `${(ok / max) * 100}%`,
        background: h ? "var(--color-saffron)" : "var(--color-hair)",
        borderRadius: err > 0 ? "0 0 0 0" : "2px 2px 0 0", transition: "background var(--t-fast)",
      }} />
    </div>
  );
}
