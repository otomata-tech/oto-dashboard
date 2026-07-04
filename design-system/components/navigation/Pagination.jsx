import React from "react";
import { IconButton } from "../core/IconButton.jsx";

function range(page, total) {
  const out = [];
  const push = (p) => out.push(p);
  push(1);
  for (let p = page - 1; p <= page + 1; p++) if (p > 1 && p < total) push(p);
  if (total > 1) push(total);
  const uniq = [...new Set(out)].sort((a, b) => a - b);
  const withGaps = [];
  uniq.forEach((p, i) => {
    if (i && p - uniq[i - 1] > 1) withGaps.push("…");
    withGaps.push(p);
  });
  return withGaps;
}

/**
 * Pagination — prev/next arrows + a compact page window with ellipses.
 * Controlled via `page` (1-based), `total`, `onChange`.
 */
export function Pagination({ page = 1, total = 1, onChange, style, ...rest }) {
  const go = (p) => onChange && onChange(Math.min(total, Math.max(1, p)));
  const pages = range(page, total);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, ...style }} {...rest}>
      <IconButton icon="chevron-right" label="précédent" size="sm" onClick={() => go(page - 1)} style={{ transform: "rotate(180deg)", opacity: page <= 1 ? 0.4 : 1 }} />
      {pages.map((p, i) => p === "…" ? (
        <span key={"g" + i} style={{ padding: "0 4px", color: "var(--color-faint)", fontFamily: "var(--font-mono)", fontSize: 12 }}>…</span>
      ) : (
        <button key={p} onClick={() => go(p)} style={{
          minWidth: 28, height: 28, padding: "0 6px", border: 0, cursor: "pointer",
          borderRadius: "var(--radius-pill)", fontFamily: "var(--font-mono)", fontSize: 12,
          fontWeight: p === page ? 700 : 500,
          background: p === page ? "var(--color-ink)" : "transparent",
          color: p === page ? "var(--color-bg)" : "var(--color-ink-soft)",
        }}>{p}</button>
      ))}
      <IconButton icon="chevron-right" label="suivant" size="sm" onClick={() => go(page + 1)} style={{ opacity: page >= total ? 0.4 : 1 }} />
    </div>
  );
}
