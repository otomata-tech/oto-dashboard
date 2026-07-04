import * as React from "react";
export interface DividerProps extends React.HTMLAttributes<HTMLElement> {
  /** Optional centered mono label (e.g. "ou"). */
  label?: string;
}
/**
 * Horizontal divider — plain hairline, or with a centered label.
 * @dsCard group="Components" name="Divider"
 */
export function Divider(props: DividerProps): JSX.Element;
