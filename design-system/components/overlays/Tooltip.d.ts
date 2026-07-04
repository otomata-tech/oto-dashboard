import * as React from "react";

export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Tooltip text. */
  label: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Hover tooltip — a small ink bubble above the wrapped element.
 * @dsCard group="Components" name="Tooltip"
 */
export function Tooltip(props: TooltipProps): JSX.Element;
