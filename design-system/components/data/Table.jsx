import React from "react";

const TH = {
  fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "var(--color-faint)", padding: "7px 14px",
  borderBottom: "1px solid var(--color-hair)", whiteSpace: "nowrap",
};
const TD = {
  padding: "var(--row-py) 14px", borderBottom: "1px solid var(--color-hair-soft)",
  color: "var(--color-ink-soft)", verticalAlign: "middle",
};

function Row({ columns, row, last, hover }) {
  const [h, setH] = React.useState(false);
  return (
    <tr onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      {columns.map((c) => (
        <td key={c.key} style={{
          ...TD, borderBottom: last ? 0 : TD.borderBottom, textAlign: c.align || "left",
          background: hover && h ? "rgba(244,236,210,0.5)" : "transparent",
          ...(c.mono ? { fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-ink)" } : null),
          ...(c.align === "right" ? { fontFamily: "var(--font-mono)", fontSize: 11 } : null),
        }}>
          {c.render ? c.render(row) : (row[c.key] ?? "—")}
        </td>
      ))}
    </tr>
  );
}

/**
 * A data table in the console `.tbl` idiom — mono uppercase headers, hairline
 * rows, row hover. `columns`: {key, label, align?, width?, mono?, render?}.
 */
export function Table({ columns, rows, hover = true, style, ...rest }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-small)", ...style }} {...rest}>
      <thead>
        <tr>{columns.map((c) => <th key={c.key} style={{ ...TH, textAlign: c.align || "left", width: c.width }}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => <Row key={i} columns={columns} row={r} last={i === rows.length - 1} hover={hover} />)}
      </tbody>
    </table>
  );
}
