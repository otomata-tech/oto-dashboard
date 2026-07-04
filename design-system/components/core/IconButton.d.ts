import * as React from "react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon name (Lucide / Oto alias). */
  icon: string;
  /** Preset size or explicit px. @default "md" */
  size?: "sm" | "md" | "lg" | number;
  /** ghost (bare), surface (hairline card), subtle. @default "ghost" */
  variant?: "ghost" | "surface" | "subtle";
  /** Accessible label (also the tooltip title). */
  label?: string;
}

/**
 * Square icon-only button — pill by the system radius rule. Topbar, row and
 * toolbar actions (menu, close, refresh, more).
 * @dsCard group="Components" name="IconButton"
 */
export function IconButton(props: IconButtonProps): JSX.Element;
