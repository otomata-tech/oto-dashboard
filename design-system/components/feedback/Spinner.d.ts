import * as React from "react";
export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Diameter in px. @default 18 */
  size?: number;
  /** Stroke width. @default 2.25 */
  sw?: number;
}
/**
 * Spinning loader — warm ring + ink arc. For inline / button loading.
 * @dsCard group="Components" name="Spinner"
 */
export function Spinner(props: SpinnerProps): JSX.Element;
