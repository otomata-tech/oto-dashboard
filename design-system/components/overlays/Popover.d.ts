import * as React from "react";

export interface PopoverProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The clickable trigger element. */
  trigger?: React.ReactNode;
  /** Panel alignment edge. @default "left" */
  align?: "left" | "right";
  /** Panel width in px. @default 240 */
  width?: number;
  /** Extra style on the floating panel. */
  panelStyle?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * Floating panel anchored under a trigger — holds arbitrary content (forms,
 * filters). Does NOT close on inner clicks (unlike Menu); closes on outside.
 * @dsCard group="Components" name="Popover"
 */
export function Popover(props: PopoverProps): JSX.Element;
