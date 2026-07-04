import * as React from "react";

export interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether the dialog is shown. */
  open?: boolean;
  /** Title (16/700). */
  title?: React.ReactNode;
  /** Sub line under the title. */
  sub?: React.ReactNode;
  /** Footer actions (buttons), right-aligned. */
  footer?: React.ReactNode;
  /** Fires on backdrop click or the ✕. */
  onClose?: () => void;
  /** Card width in px. @default 440 */
  width?: number;
  children?: React.ReactNode;
}

/**
 * Modal dialog — dimmed backdrop + centered card. Base for NameDialog /
 * confirm / form prompts.
 * @dsCard group="Components" name="Dialog"
 */
export function Dialog(props: DialogProps): JSX.Element | null;
