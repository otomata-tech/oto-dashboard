import * as React from "react";

export interface SegProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Options as `["status","activity"]` or `[["k","Label"], …]`. */
  options: Array<string | [string, string]>;
  /** Currently selected value. */
  value: string;
  /** Called with the new value on click. */
  onChange?: (value: string) => void;
}

/**
 * Segmented control for toggling a view or mode (2–3 short options).
 * Active segment fills ink; the rest are quiet mono-weight labels.
 * @dsCard group="Components" name="Seg"
 */
export function Seg(props: SegProps): JSX.Element;
