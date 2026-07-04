import * as React from "react";

/**
 * Stat props.
 * @startingPoint section="Data" subtitle="Stat — KPI tile with unit, sub, sparkline" viewport="700x150"
 */
export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Mono uppercase label. */
  label: string;
  /** The big value (number or string). */
  value: string | number;
  /** Small trailing unit (e.g. "/ 12", "%"). */
  unit?: string;
  /** Help line under the value. */
  sub?: string;
  /** Override value color (e.g. var(--color-terra-ink) for a bad metric). */
  tone?: string;
  /** Series for an inline saffron sparkline (≥2 points). */
  spark?: number[];
}

/**
 * KPI tile. Group them in a `.grid4`. Use `tone` sparingly to flag a metric
 * that has gone bad; `spark` adds a 7-point trend line.
 * @dsCard group="Components" name="Stat"
 */
export function Stat(props: StatProps): JSX.Element;
