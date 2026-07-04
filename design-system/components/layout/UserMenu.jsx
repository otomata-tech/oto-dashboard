import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Avatar } from "../brand/Avatar.jsx";

/**
 * The sidebar foot user row (dark) — avatar + name + email + chevron. Opens
 * the account / workspace menu (wire `onClick`).
 */
export function UserMenu({ name = "Jean-Baptiste", email = "jb@oto.ninja", avatar, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "6px 8px", border: 0, borderRadius: "var(--radius-md)", cursor: "pointer",
        background: hover ? "var(--sidebar-hover-bg)" : "transparent",
        transition: "background var(--t-fast)", ...style,
      }}
      {...rest}
    >
      <Avatar src={avatar} name={name} size={30} />
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--sidebar-fg-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 10.5, color: "var(--sidebar-fg-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
      </div>
      <Icon name="chevron-down" size={14} style={{ color: "var(--sidebar-fg-mute)" }} />
    </button>
  );
}
