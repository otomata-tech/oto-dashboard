import * as React from "react";

export interface CheckStepProps {
  /** Completed — bullet becomes an olive check, title struck through. */
  done?: boolean;
  /** Step number, shown in the bullet when not done. */
  n?: number | string;
  /** Step title. */
  title: React.ReactNode;
  /** Description / help (children). */
  children?: React.ReactNode;
  /** Optional action node (e.g. a mini Button) shown under the description. */
  action?: React.ReactNode;
  /** Drop the bottom hairline (last item in a list). */
  last?: boolean;
}

/**
 * Onboarding / checklist row. Stack several to build a setup checklist.
 * @dsCard group="Components" name="CheckStep"
 */
export function CheckStep(props: CheckStepProps): JSX.Element;
