import * as React from "react";

export type DotTone = "olive" | "terra" | "saffron" | "cobalt" | "faint";

export interface DotProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic tone. @default "olive" */
  tone?: DotTone;
  /** Diameter in px. @default 8 */
  size?: number;
}

/**
 * Small status dot — the quietest way to carry a state. Pair with a label.
 * @dsCard group="Components" name="Dot"
 */
export function Dot(props: DotProps): JSX.Element;
