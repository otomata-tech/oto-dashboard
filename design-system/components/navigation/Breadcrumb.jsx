import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * Breadcrumb trail — mono-free crumbs separated by chevrons. `items`:
 * {label, href?}[]. The last item is the current page (ink, weight 600).
 */
export function Breadcrumb({ items, style, ...rest }) {
  return (
    <nav aria-label="breadcrumb" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, ...style }} {...rest}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 ? <Icon name="chevron-right" size={13} style={{ color: "var(--color-faint)" }} /> : null}
            {it.href && !last ? (
              <a href={it.href} style={{ color: "var(--color-mute)", textDecoration: "none" }}>{it.label}</a>
            ) : (
              <span style={{ color: last ? "var(--color-ink)" : "var(--color-mute)", fontWeight: last ? 600 : 400 }}>{it.label}</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
