import * as React from "react";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  checked?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  label?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Checkbox + label — checked fills ink with a check.
 * @dsCard group="Components" name="Checkbox"
 */
export function Checkbox(props: CheckboxProps): JSX.Element;
