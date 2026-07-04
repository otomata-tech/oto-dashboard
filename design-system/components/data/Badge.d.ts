import * as React from "react";
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic tone. @default "neutral" */
  tone?: "neutral" | "olive" | "saffron" | "terra" | "cobalt" | "ink";
  children?: React.ReactNode;
}
/**
 * Small count / status badge — a compact mono pill (smaller than Tag).
 * @dsCard group="Components" name="Badge"
 */
export function Badge(props: BadgeProps): JSX.Element;
