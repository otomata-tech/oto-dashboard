import * as React from "react";

export type TagTone = "neutral" | "olive" | "saffron" | "terra" | "cobalt" | "ink";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * Semantic tone. olive=success, terra=danger, saffron=warning/partial,
   * cobalt=info, ink=inverted, neutral=outlined.
   * @default "neutral"
   */
  tone?: TagTone;
  children?: React.ReactNode;
}

/**
 * Mono uppercase status pill. One meaning per color — never decorative.
 * @dsCard group="Components" name="Tag"
 */
export function Tag(props: TagProps): JSX.Element;
