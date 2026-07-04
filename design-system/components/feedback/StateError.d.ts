import * as React from "react";

export interface StateErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Title (terra). @default "quelque chose a échoué" */
  title?: string;
  /** Error message. */
  message?: React.ReactNode;
  /** Retry handler — shows a retry button. */
  onRetry?: () => void;
}

/**
 * Error state — terra-bordered card + message + retry. Every failable view
 * renders this, never a silent fallback.
 * @dsCard group="Components" name="StateError"
 */
export function StateError(props: StateErrorProps): JSX.Element;
