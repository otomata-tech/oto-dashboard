import * as React from "react";

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  checked?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  label?: React.ReactNode;
  name?: string;
  value?: string;
  disabled?: boolean;
}

/**
 * Radio + label; group by `name`. Selected = thick ink ring.
 * @dsCard group="Components" name="Radio"
 */
export function Radio(props: RadioProps): JSX.Element;
