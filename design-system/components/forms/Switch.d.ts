import * as React from "react";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  checked?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  label?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Toggle switch — on = olive. Controlled.
 * @dsCard group="Components" name="Switch"
 */
export function Switch(props: SwitchProps): JSX.Element;
