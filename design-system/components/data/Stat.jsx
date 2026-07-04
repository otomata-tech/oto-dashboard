import React from "react";

function sparkPoints(v) {
  if (!v || v.length < 2) return "";
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const n = v.length;
  return v.map((x, i) => `${(i / (n - 1)) * 70 + 1},${22 - ((x - min) / span) * 18}`).join(" ");
}

/**
 * A KPI tile — mono uppercase label, big value with optional unit, help sub,
 * and an optional saffron sparkline. Drop several into a `.grid4`.
 */
export function Stat({ label, value, unit, sub, tone, spark, style, ...rest }) {
  const pts = sparkPoints(spark);
  const last = pts ? pts.split(" ").pop().split(",").map(Number) : null;
  return (
    <div
      style={{
        border: "1px solid var(--border-card)", borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-card)",
        padding: "14px 16px", background: "var(--color-surface)", ...style,
      }}
      {...rest}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-mute)" }}>{label}</div>
      <div
        style={{
          fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 5,
          color: tone || undefined,
          ...(pts ? { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 } : null),
        }}
      >
        <span>{value}{unit ? <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-faint)", letterSpacing: 0, marginLeft: 4 }}>{unit}</span> : null}</span>
        {pts ? (
          <svg width="72" height="26" viewBox="0 0 72 26" fill="none" style={{ flexShrink: 0 }}>
            <polyline points={pts} stroke="var(--color-saffron)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {last ? <circle cx={last[0]} cy={last[1]} r="2.1" fill="var(--color-saffron)" /> : null}
          </svg>
        ) : null}
      </div>
      {sub ? <div style={{ fontSize: 11.5, color: "var(--color-mute)", marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}
