import * as React from "react";

export interface DayBarsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** [ok, err] per period. */
  data: Array<[number, number]>;
  /** Height in px. @default 84 */
  height?: number;
}

/**
 * Activity histogram — olive/hair bars with terra failures on top.
 * @dsCard group="Components" name="DayBars"
 */
export function DayBars(props: DayBarsProps): JSX.Element;
