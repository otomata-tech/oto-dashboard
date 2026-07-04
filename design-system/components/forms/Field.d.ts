import * as React from "react";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Mono uppercase label. */
  label?: string;
  /** Help line under the control. */
  hint?: React.ReactNode;
  /** Error line (terra) — supersedes hint. */
  error?: React.ReactNode;
  /** `htmlFor` on the label. */
  htmlFor?: string;
  children?: React.ReactNode;
}

/**
 * Form field wrapper: label + control + hint/error. Wrap any input.
 * @dsCard group="Components" name="Field"
 */
export function Field(props: FieldProps): JSX.Element;
