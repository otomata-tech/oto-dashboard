import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * A file drop area — dashed hairline that turns saffron on drag-over. Calls
 * `onFiles(FileList)` on drop. Sits on the sunken paper surface.
 */
export function Dropzone({ label = "glissez un fichier ici", hint, icon = "download", onFiles, style, ...rest }) {
  const [over, setOver] = React.useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles && onFiles(e.dataTransfer.files); }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 8, textAlign: "center", padding: "26px 20px",
        border: `1.5px dashed ${over ? "var(--color-saffron)" : "var(--color-hair-classic)"}`,
        borderRadius: "var(--radius-md)",
        background: over ? "var(--color-saffron-soft)" : "var(--surface-sunken)",
        color: "var(--color-mute)", transition: "background var(--t-fast), border-color var(--t-fast)", cursor: "pointer",
        ...style,
      }}
      {...rest}
    >
      <Icon name={icon} size={22} style={{ color: "var(--color-faint)" }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-soft)" }}>{label}</div>
      {hint ? <div style={{ fontSize: 11.5 }}>{hint}</div> : null}
    </div>
  );
}
