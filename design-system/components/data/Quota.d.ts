import * as React from "react";

export interface QuotaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Amount consumed. */
  used: number;
  /** Total available. */
  total: number;
  /** Optional left-side label. */
  label?: string;
}

/**
 * Usage bar with auto semantic color: olive (ok) → saffron (≥75%) → terra
 * (≥100%). Also used for onboarding progress (done / total steps).
 *
 * @dsCard group="Components" name="Quota"
 */
export function Quota(props: QuotaProps): JSX.Element;
