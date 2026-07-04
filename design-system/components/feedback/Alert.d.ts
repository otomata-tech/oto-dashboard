import * as React from "react";
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Semantic tone. @default "info" */
  tone?: "info" | "success" | "warning" | "danger";
  /** Bold title line. */
  title?: React.ReactNode;
  /** Override the tone's default icon. */
  icon?: string;
  /** Show a dismiss ✕ and call this. */
  onClose?: () => void;
  children?: React.ReactNode;
}
/**
 * Inline alert / callout — soft-fill row + semantic icon + optional dismiss.
 * @dsCard group="Components" name="Alert"
 */
export function Alert(props: AlertProps): JSX.Element;
