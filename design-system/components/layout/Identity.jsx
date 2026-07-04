import React from "react";
import { Medallion } from "../brand/Medallion.jsx";
import { Avatar } from "../brand/Avatar.jsx";

/**
 * The sidebar identity block (dark) — org logo/medallion + kicker + name +
 * optional role pill. Display-only; the org switcher lives in the UserMenu.
 */
export function Identity({ org = "Otomata", kicker = "votre contexte", role, logo, style, ...rest }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }} {...rest}>
      {logo ? <Avatar src={logo} name={org} shape="square" size={34} /> : <Medallion size="sm" />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sidebar-fg-mute)", lineHeight: 1.2 }}>{kicker}</div>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: "var(--sidebar-fg-strong)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{org}</div>
        {role ? (
          <div style={{ marginTop: 3 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.04em", padding: "1px 6px", borderRadius: "var(--radius-pill)", background: "rgba(255,255,255,.08)", color: "var(--sidebar-fg)" }}>{role}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
